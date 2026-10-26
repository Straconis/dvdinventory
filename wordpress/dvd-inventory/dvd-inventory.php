<?php
/**
 * Plugin Name: DVD Inventory
 * Description: A self-contained DVD catalog with copies, loans, tote locations, cover uploads, and CSV export. No external services.
 * Version: 1.0.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * Text Domain: dvd-inventory
 */

defined( 'ABSPATH' ) || exit;

final class DVD_Inventory {
 const TYPE = 'dvdi_dvd';
 const VERSION = '1.0.0';

 public static function boot() {
  add_action( 'init', array( __CLASS__, 'register' ) );
  add_action( 'add_meta_boxes', array( __CLASS__, 'boxes' ) );
  add_action( 'save_post_' . self::TYPE, array( __CLASS__, 'save' ) );
  add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
  add_action( 'wp_enqueue_scripts', array( __CLASS__, 'styles' ) );
  add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
  add_action( 'admin_post_dvdi_export', array( __CLASS__, 'export' ) );
  add_filter( 'manage_' . self::TYPE . '_posts_columns', array( __CLASS__, 'columns' ) );
  add_action( 'manage_' . self::TYPE . '_posts_custom_column', array( __CLASS__, 'column' ), 10, 2 );
  add_shortcode( 'dvd_inventory', array( __CLASS__, 'catalog' ) );
 }

 public static function register() {
  register_post_type( self::TYPE, array(
   'labels' => array( 'name' => 'DVD Inventory', 'singular_name' => 'DVD', 'add_new_item' => 'Add DVD', 'edit_item' => 'Edit DVD', 'all_items' => 'All DVDs', 'search_items' => 'Search DVDs', 'not_found' => 'No DVDs found' ),
   'public' => false, 'show_ui' => true, 'show_in_rest' => false,
   'menu_icon' => 'dashicons-album', 'supports' => array( 'title' ),
   'capability_type' => array( 'dvdi_dvd', 'dvdi_dvds' ), 'map_meta_cap' => true,
   'rewrite' => false, 'query_var' => false,
  ) );
 }

 public static function activate() {
  self::register();
  $role = get_role( 'administrator' );
  if ( $role ) {
   foreach ( array( 'edit_dvdi_dvds', 'edit_others_dvdi_dvds', 'publish_dvdi_dvds', 'read_private_dvdi_dvds', 'delete_dvdi_dvds', 'delete_private_dvdi_dvds', 'delete_published_dvdi_dvds', 'delete_others_dvdi_dvds', 'edit_private_dvdi_dvds', 'edit_published_dvdi_dvds' ) as $cap ) {
    $role->add_cap( $cap );
   }
  }
 }

 private static function fields() {
  return array(
   'upc' => array( 'UPC / barcode', 'text', '' ),
   'year' => array( 'Release year', 'number', '' ),
   'format' => array( 'Format', 'select', 'DVD' ),
   'genre' => array( 'Genre', 'text', '' ),
   'location' => array( 'Tote / shelf location', 'text', '' ),
   'quantity' => array( 'Total copies', 'number', '1' ),
   'loaned' => array( 'Copies on loan', 'number', '0' ),
   'notes' => array( 'Private notes (borrower, due date, condition, etc.)', 'textarea', '' ),
  );
 }

 private static function meta( $id, $key, $default = '' ) {
  return metadata_exists( 'post', $id, '_dvdi_' . $key ) ? get_post_meta( $id, '_dvdi_' . $key, true ) : $default;
 }

 public static function boxes() {
  add_meta_box( 'dvdi_details', 'DVD details', array( __CLASS__, 'details' ), self::TYPE, 'normal', 'high' );
 }

 public static function details( $post ) {
  wp_nonce_field( 'dvdi_save', 'dvdi_nonce' );
  echo '<p>Use the title above for the DVD title. Each record represents one edition; quantities track duplicate copies. All data stays on this WordPress site.</p><table class="form-table" role="presentation">';
  foreach ( self::fields() as $key => $field ) {
   $value = self::meta( $post->ID, $key, $field[2] );
   echo '<tr><th><label for="dvdi_' . esc_attr( $key ) . '">' . esc_html( $field[0] ) . '</label></th><td>';
   $attrs = ' id="dvdi_' . esc_attr( $key ) . '" name="dvdi[' . esc_attr( $key ) . ']"';
   if ( 'select' === $field[1] ) {
    echo '<select' . $attrs . '>';
    foreach ( array( 'DVD', 'Blu-ray', '4K UHD', 'HD DVD', 'Other' ) as $format ) {
     echo '<option' . selected( $value, $format, false ) . '>' . esc_html( $format ) . '</option>';
    }
    echo '</select>';
   } elseif ( 'textarea' === $field[1] ) {
    echo '<textarea class="large-text" rows="4"' . $attrs . '>' . esc_textarea( $value ) . '</textarea>';
   } else {
    $limits = 'year' === $key ? ' min="1888" max="9999"' : ( 'number' === $field[1] ? ' min="0" max="1000000"' : '' );
    echo '<input class="regular-text" type="' . esc_attr( $field[1] ) . '"' . $attrs . $limits . ' value="' . esc_attr( $value ) . '">';
   }
   echo '</td></tr>';
  }
  $cover = absint( self::meta( $post->ID, 'cover' ) );
  echo '<tr><th>Cover image</th><td><div id="dvdi-cover-preview">' . ( $cover ? wp_get_attachment_image( $cover, 'thumbnail' ) : '' ) . '</div><input type="hidden" id="dvdi-cover" name="dvdi[cover]" value="' . esc_attr( $cover ) . '"><button type="button" class="button" id="dvdi-cover-choose">Choose / upload cover</button> <button type="button" class="button" id="dvdi-cover-remove">Remove cover</button><p class="description">Upload an image or choose one already in this site’s media library.</p></td></tr></table><p>Copies on loan cannot exceed total copies. Private notes and storage locations never appear in a public catalog.</p>';
 }

 public static function normalize( $raw ) {
  $data = array();
  foreach ( self::fields() as $key => $field ) {
   $value = isset( $raw[$key] ) && is_scalar( $raw[$key] ) ? (string) $raw[$key] : $field[2];
   $data[$key] = 'notes' === $key ? sanitize_textarea_field( $value ) : sanitize_text_field( $value );
  }
  $data['format'] = in_array( $data['format'], array( 'DVD', 'Blu-ray', '4K UHD', 'HD DVD', 'Other' ), true ) ? $data['format'] : 'DVD';
  $data['quantity'] = min( 1000000, max( 0, (int) $data['quantity'] ) );
  $data['loaned'] = min( $data['quantity'], max( 0, (int) $data['loaned'] ) );
  $data['year'] = '' !== $data['year'] && (int) $data['year'] >= 1888 && (int) $data['year'] <= 9999 ? (string) (int) $data['year'] : '';
  $data['cover'] = isset( $raw['cover'] ) && is_scalar( $raw['cover'] ) ? absint( $raw['cover'] ) : 0;
  if ( $data['cover'] && ! wp_attachment_is_image( $data['cover'] ) ) {
   $data['cover'] = 0;
  }
  return $data;
 }

 public static function save( $id ) {
  if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || wp_is_post_revision( $id ) || ! current_user_can( 'edit_post', $id ) ) { return; }
  if ( ! isset( $_POST['dvdi_nonce'] ) || ! is_string( $_POST['dvdi_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['dvdi_nonce'] ) ), 'dvdi_save' ) ) { return; }
  if ( ! isset( $_POST['dvdi'] ) || ! is_array( $_POST['dvdi'] ) ) { return; }
  foreach ( self::normalize( wp_unslash( $_POST['dvdi'] ) ) as $key => $value ) {
   update_post_meta( $id, '_dvdi_' . $key, wp_slash( $value ) );
  }
 }

 public static function admin_assets() {
  $screen = get_current_screen();
  if ( $screen && self::TYPE === $screen->post_type && 'post' === $screen->base ) {
   wp_enqueue_media();
   wp_enqueue_script( 'dvdi-admin', plugins_url( 'assets/admin.js', __FILE__ ), array( 'jquery', 'media-editor' ), self::VERSION, true );
  }
 }

 public static function styles() {
  // Enqueued before the theme header so shortcodes in templates also receive styling.
  wp_enqueue_style( 'dvdi-catalog', plugins_url( 'assets/catalog.css', __FILE__ ), array(), self::VERSION );
 }

 public static function columns( $columns ) {
  return array_merge( $columns, array( 'dvdi_format' => 'Format', 'dvdi_upc' => 'UPC', 'dvdi_location' => 'Tote / shelf', 'dvdi_stock' => 'Available / total' ) );
 }

 public static function column( $column, $id ) {
  if ( 'dvdi_stock' === $column ) {
   $total = (int) self::meta( $id, 'quantity', 1 );
   echo esc_html( max( 0, $total - (int) self::meta( $id, 'loaned', 0 ) ) . ' / ' . $total );
  } elseif ( in_array( $column, array( 'dvdi_format', 'dvdi_upc', 'dvdi_location' ), true ) ) {
   echo esc_html( self::meta( $id, substr( $column, 5 ) ) );
  }
 }

 private static function param( $key ) {
  return isset( $_GET[$key] ) && is_string( $_GET[$key] ) ? sanitize_text_field( wp_unslash( $_GET[$key] ) ) : '';
 }

 public static function catalog( $atts = array() ) {
  $atts = shortcode_atts( array( 'public' => 'no', 'per_page' => 24 ), $atts, 'dvd_inventory' );
  $public = 'yes' === strtolower( (string) $atts['public'] );
  if ( ! $public ) {
   if ( ! defined( 'DONOTCACHEPAGE' ) ) { define( 'DONOTCACHEPAGE', true ); }
   if ( ! headers_sent() ) { nocache_headers(); }
  }
  if ( ! $public && ( ! is_user_logged_in() || ! current_user_can( 'edit_dvdi_dvds' ) ) ) {
   return '<p class="dvdi-message">This inventory is private. Sign in with an inventory administrator account to view it.</p>';
  }
  $manage = ! $public && current_user_can( 'edit_dvdi_dvds' );
  $search = self::param( 'dvdi_q' );
  $format = self::param( 'dvdi_format' );
  $page = max( 1, (int) self::param( 'dvdi_page' ) );
  $meta = array( 'relation' => 'AND' );
  if ( '' !== $search ) {
   // Search title, UPC, and (only in private mode) storage location without raw SQL.
   $title_ids = get_posts( array( 'post_type' => self::TYPE, 'post_status' => 'publish', 's' => $search, 'fields' => 'ids', 'posts_per_page' => -1 ) );
   $search_meta = array( 'relation' => 'OR', array( 'key' => '_dvdi_upc', 'value' => $search, 'compare' => 'LIKE' ) );
   if ( $manage ) { $search_meta[] = array( 'key' => '_dvdi_location', 'value' => $search, 'compare' => 'LIKE' ); }
   $meta_ids = get_posts( array( 'post_type' => self::TYPE, 'post_status' => 'publish', 'meta_query' => $search_meta, 'fields' => 'ids', 'posts_per_page' => -1 ) );
   $ids = array_unique( array_merge( $title_ids, $meta_ids ) );
  }
  if ( $format ) { $meta[] = array( 'key' => '_dvdi_format', 'value' => $format ); }
  $args = array( 'post_type' => self::TYPE, 'post_status' => 'publish', 'posts_per_page' => max( 1, min( 96, (int) $atts['per_page'] ) ), 'paged' => $page, 'orderby' => 'title', 'order' => 'ASC' );
  if ( '' !== $search ) { $args['post__in'] = $ids ? $ids : array( 0 ); }
  if ( count( $meta ) > 1 ) { $args['meta_query'] = $meta; }
  $query = new WP_Query( $args );
  ob_start();
  echo '<section class="dvdi-catalog" aria-label="DVD inventory"><div class="dvdi-heading"><div><span class="dvdi-eyebrow">YOUR COLLECTION</span><h2>DVD Inventory</h2></div><span class="dvdi-count">' . esc_html( number_format_i18n( $query->found_posts ) ) . ' titles</span></div>';
  echo '<form method="get" class="dvdi-filters" action="' . esc_url( get_permalink() ) . '">';
  // Preserve a plain-permalink page ID and other scalar query parameters.
  foreach ( $_GET as $key => $value ) {
   if ( is_string( $value ) && 0 !== strpos( (string) $key, 'dvdi_' ) ) {
    echo '<input type="hidden" name="' . esc_attr( $key ) . '" value="' . esc_attr( wp_unslash( $value ) ) . '">';
   }
  }
  echo '<label>Search<input type="search" name="dvdi_q" placeholder="' . ( $manage ? 'Title, UPC, or tote' : 'Title or UPC' ) . '" value="' . esc_attr( $search ) . '"></label><label>Format<select name="dvdi_format"><option value="">All formats</option>';
  foreach ( array( 'DVD', 'Blu-ray', '4K UHD', 'HD DVD', 'Other' ) as $option ) {
   echo '<option value="' . esc_attr( $option ) . '"' . selected( $format, $option, false ) . '>' . esc_html( $option ) . '</option>';
  }
  echo '</select></label><button type="submit">Search collection</button></form><div class="dvdi-grid">';
  foreach ( $query->posts as $dvd ) {
   $id = $dvd->ID;
   $total = (int) self::meta( $id, 'quantity', 1 );
   $available = max( 0, $total - (int) self::meta( $id, 'loaned', 0 ) );
   $cover = absint( self::meta( $id, 'cover' ) );
   echo '<article class="dvdi-card"><div class="dvdi-cover">';
   $cover_html = $cover ? wp_get_attachment_image( $cover, 'medium', false, array( 'loading' => 'lazy', 'alt' => $dvd->post_title . ' cover' ) ) : '';
   echo $cover_html ? $cover_html : '<span class="dvdi-placeholder" aria-hidden="true">DVD<span>No cover uploaded</span></span>';
   echo '</div><div class="dvdi-info"><span class="dvdi-format">' . esc_html( self::meta( $id, 'format', 'DVD' ) ) . '</span><h3>' . esc_html( $dvd->post_title ) . '</h3><p class="dvdi-muted">' . esc_html( implode( ' · ', array_filter( array( self::meta( $id, 'year' ), self::meta( $id, 'genre' ) ) ) ) ) . '</p><p>' . esc_html( $available . ' of ' . $total . ' available' ) . '</p>';
   $upc = self::meta( $id, 'upc' );
   if ( $upc ) { echo '<p class="dvdi-muted">UPC: ' . esc_html( $upc ) . '</p>'; }
   if ( $manage ) {
    echo '<p class="dvdi-location">' . esc_html( self::meta( $id, 'location', 'No location set' ) ) . '</p><a href="' . esc_url( get_edit_post_link( $id ) ) . '">Edit DVD</a>';
   }
   echo '</div></article>';
  }
  echo '</div>';
  if ( ! $query->posts ) { echo '<p class="dvdi-empty">No DVDs found. Try another search' . ( $manage ? ' or add a DVD in the WordPress dashboard.' : '.' ) . '</p>'; }
  if ( $query->max_num_pages > 1 ) {
   echo '<nav class="dvdi-pages" aria-label="Inventory pages">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( 'dvdi_page', '%#%' ), 'format' => '', 'current' => $page, 'total' => $query->max_num_pages, 'type' => 'list' ) ) ) . '</nav>';
  }
  echo '</section>';
  return ob_get_clean();
 }

 public static function menu() {
  add_submenu_page( 'edit.php?post_type=' . self::TYPE, 'Setup & export', 'Setup & export', 'manage_options', 'dvdi-setup', array( __CLASS__, 'setup' ) );
 }

 public static function setup() {
  if ( ! current_user_can( 'manage_options' ) ) { return; }
  echo '<div class="wrap"><h1>DVD Inventory — Setup & export</h1><p>Your collection is stored entirely in this WordPress database. Cover images use your media library. No external accounts, requests, tracking, fonts, or artwork services are used by this plugin.</p><ol><li>Add records under <strong>DVD Inventory → Add DVD</strong> and publish them. Drafts stay hidden.</li><li>Create a WordPress page and insert a Shortcode block containing <code>[dvd_inventory]</code>.</li><li>That page’s inventory is restricted to inventory administrators. To intentionally share a public catalog, use <code>[dvd_inventory public="yes"]</code>. Public mode hides tote locations, private notes, and editing links, even for administrators.</li></ol><p>Optional: <code>[dvd_inventory per_page="24"]</code> controls page size (1–96). Inventory administration is granted to administrators only by default.</p><h2>Download CSV backup</h2><p>Exports all non-trashed DVD records, including drafts, private notes, locations, and WordPress cover attachment IDs. Images are separate files; back up the WordPress database and uploads directory for a full restore. Spreadsheet programs may require setting UPC columns to text to preserve leading zeros.</p><a class="button button-primary" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=dvdi_export' ), 'dvdi_export' ) ) . '">Export DVD inventory CSV</a><h2>Copies and loans</h2><p>Update total copies and copies on loan when lending or returning a disc. Borrower details can go in private notes. This version does not maintain individual loan transactions or send reminders.</p><h2>Keeping your collection</h2><p>Deactivating or deleting the plugin keeps your DVD records and cover images. Reinstall and activate it to access the records again. This plugin does not import data from the standalone DVD Inventory app.</p></div>';
 }

 public static function csv_cell( $value ) {
  $value = (string) $value;
  // Neutralize formulas, including ones preceded by whitespace or control characters.
  return preg_match( '/^[\x00-\x20]*[=+@-]/', $value ) ? "'" . $value : $value;
 }

 public static function export() {
  if ( ! current_user_can( 'manage_options' ) || ! current_user_can( 'edit_dvdi_dvds' ) ) { wp_die( 'Not authorized.', '', array( 'response' => 403 ) ); }
  check_admin_referer( 'dvdi_export' );
  nocache_headers();
  header( 'Content-Type: text/csv; charset=utf-8' );
  header( 'Content-Disposition: attachment; filename="dvd-inventory-' . gmdate( 'Y-m-d' ) . '.csv"' );
  $out = fopen( 'php://output', 'w' );
  fputcsv( $out, array( 'id', 'title', 'status', 'upc', 'year', 'format', 'genre', 'location', 'quantity', 'loaned', 'notes', 'cover_attachment_id' ), ',', '"', '' );
  $page = 1;
  do {
   $query = new WP_Query( array( 'post_type' => self::TYPE, 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => 200, 'paged' => $page, 'orderby' => 'ID', 'order' => 'ASC' ) );
   foreach ( $query->posts as $post ) {
    $row = array( $post->ID, $post->post_title, $post->post_status );
    foreach ( self::fields() as $key => $field ) { $row[] = self::meta( $post->ID, $key, $field[2] ); }
    $row[] = self::meta( $post->ID, 'cover', 0 );
    fputcsv( $out, array_map( array( __CLASS__, 'csv_cell' ), $row ), ',', '"', '' );
   }
   $page++;
  } while ( $page <= $query->max_num_pages );
  fclose( $out );
  exit;
 }
}

DVD_Inventory::boot();
register_activation_hook( __FILE__, array( 'DVD_Inventory', 'activate' ) );
