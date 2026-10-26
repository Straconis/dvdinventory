<?php
/** Run only against a disposable, installed WordPress database. */
$root = getenv( 'DVDI_WP_ROOT' );
if ( ! $root || ! is_file( $root . '/wp-load.php' ) ) {
 fwrite( STDERR, "Set DVDI_WP_ROOT to a disposable WordPress install.\n" );
 exit( 1 );
}
$_SERVER['HTTP_HOST'] = 'localhost:8765';
$_SERVER['SERVER_PROTOCOL'] = 'HTTP/1.1';
$_SERVER['REQUEST_URI'] = '/';
require $root . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/user.php';
require_once dirname( __DIR__ ) . '/dvd-inventory/dvd-inventory.php';
DVD_Inventory::activate();
$checks = 0;
$ids = array();
$subscriber = 0;
function check_dvdi( $condition, $message ) {
 global $checks;
 if ( ! $condition ) { throw new RuntimeException( $message ); }
 $checks++;
 fwrite( STDERR, "PASS: $message\n" );
}
function save_dvdi( $id, $values, $nonce = null ) {
 $_POST = array( 'dvdi' => wp_slash( $values ), 'dvdi_nonce' => null === $nonce ? wp_create_nonce( 'dvdi_save' ) : $nonce );
 DVD_Inventory::save( $id );
 $_POST = array();
}
function cleanup_dvdi() {
 global $ids, $subscriber;
 $_POST = array();
 foreach ( $ids as $id ) { wp_delete_post( $id, true ); }
 if ( $subscriber ) { wp_delete_user( $subscriber ); }
}
try {
 $admins = get_users( array( 'role' => 'administrator', 'number' => 1 ) );
 if ( ! $admins ) { throw new RuntimeException( 'Disposable WordPress needs an administrator.' ); }
 wp_set_current_user( $admins[0]->ID );
 check_dvdi( current_user_can( 'edit_dvdi_dvds' ), 'Activation grants administrator inventory capability' );
 $page = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'DVDI test page' ), true );
 if ( is_wp_error( $page ) ) { throw new RuntimeException( $page->get_error_message() ); }
 $ids[] = $page;
 $GLOBALS['post'] = get_post( $page );
 $dvd = wp_insert_post( array( 'post_type' => DVD_Inventory::TYPE, 'post_status' => 'publish', 'post_title' => 'DVDI The <em>Example</em>' ), true );
 if ( is_wp_error( $dvd ) ) { throw new RuntimeException( $dvd->get_error_message() ); }
 $ids[] = $dvd;
 save_dvdi( $dvd, array( 'upc' => '001234567890', 'year' => '1999', 'quantity' => '3', 'loaned' => '1', 'format' => 'Blu-ray', 'genre' => 'Drama', 'location' => 'TOTE-SECRET-984', 'notes' => 'PRIVATE-BORROWER-745 C:\DVDs\Loan' ) );
 check_dvdi( '001234567890' === get_post_meta( $dvd, '_dvdi_upc', true ), 'Leading-zero UPC survives save' );
 check_dvdi( 'PRIVATE-BORROWER-745 C:\DVDs\Loan' === get_post_meta( $dvd, '_dvdi_notes', true ), 'Private notes preserve literal backslashes' );
 $clean = DVD_Inventory::normalize( array( 'quantity' => '-3', 'loaned' => '99', 'year' => '1800', 'format' => '<script>bad</script>', 'cover' => '9999999', 'genre' => array( 'bad' ) ) );
 check_dvdi( 0 === $clean['quantity'] && 0 === $clean['loaned'] && '' === $clean['year'] && 'DVD' === $clean['format'] && 0 === $clean['cover'], 'Invalid counts, year, format, and image are bounded safely' );
 $clean = DVD_Inventory::normalize( array( 'quantity' => '2', 'loaned' => '7' ) );
 check_dvdi( 2 === $clean['loaned'], 'Loan count cannot exceed total copies' );
 save_dvdi( $dvd, array( 'quantity' => '999' ), 'invalid' );
 check_dvdi( '3' === get_post_meta( $dvd, '_dvdi_quantity', true ), 'Invalid nonce cannot modify records' );
 $_GET = array();
 $private = DVD_Inventory::catalog();
 check_dvdi( false !== strpos( $private, 'TOTE-SECRET-984' ) && false !== strpos( $private, 'Edit DVD' ), 'Private administrator catalog includes storage and edit links' );
 check_dvdi( false !== strpos( $private, '2 of 3 available' ), 'Availability is total minus loans' );
 check_dvdi( false === strpos( $private, 'PRIVATE-BORROWER-745' ), 'Borrower notes are never rendered in catalog HTML' );
 check_dvdi( false === strpos( $private, '<em>Example</em>' ) && false !== strpos( $private, '&lt;em&gt;Example&lt;/em&gt;' ), 'DVD title HTML is escaped' );
 $public = DVD_Inventory::catalog( array( 'public' => 'yes' ) );
 check_dvdi( false === strpos( $public, 'TOTE-SECRET-984' ) && false === strpos( $public, 'PRIVATE-BORROWER-745' ) && false === strpos( $public, 'Edit DVD' ), 'Public mode hides private fields even for administrators' );
 $_GET = array( 'dvdi_q' => '001234567890' );
 check_dvdi( false !== strpos( DVD_Inventory::catalog( array( 'public' => 'yes' ) ), 'DVDI The' ), 'Public search finds a leading-zero UPC' );
 $_GET = array( 'dvdi_q' => 'TOTE-SECRET-984' );
 check_dvdi( false !== strpos( DVD_Inventory::catalog(), 'DVDI The' ), 'Private search finds a tote location' );
 check_dvdi( false === strpos( DVD_Inventory::catalog( array( 'public' => 'yes' ) ), 'DVDI The' ), 'Public search cannot infer a private tote location' );
 $_GET = array( 'dvdi_q' => 'does-not-exist-dvdi' );
 check_dvdi( false !== strpos( DVD_Inventory::catalog(), 'No DVDs found' ), 'Unmatched search returns an empty result' );
 $_GET = array( 'dvdi_format' => 'DVD' );
 check_dvdi( false === strpos( DVD_Inventory::catalog(), 'DVDI The' ), 'Format filter excludes different formats' );
 $_GET = array( 'dvdi_q' => 'DVDI' );
 $draft = wp_insert_post( array( 'post_type' => DVD_Inventory::TYPE, 'post_status' => 'draft', 'post_title' => 'DVDI HIDDEN-DRAFT' ) );
 $ids[] = $draft;
 check_dvdi( false === strpos( DVD_Inventory::catalog(), 'HIDDEN-DRAFT' ), 'Drafts stay out of the catalog' );
 for ( $i = 0; $i < 3; $i++ ) {
  $ids[] = wp_insert_post( array( 'post_type' => DVD_Inventory::TYPE, 'post_status' => 'publish', 'post_title' => 'DVDI Fixture ' . $i ) );
 }
 $html = DVD_Inventory::catalog( array( 'per_page' => 2 ) );
 check_dvdi( 2 === substr_count( $html, '<article class="dvdi-card">' ) && false !== strpos( $html, 'Inventory pages' ), 'Page size and pagination work' );
 $_GET['dvdi_page'] = 2;
 check_dvdi( 2 === substr_count( DVD_Inventory::catalog( array( 'per_page' => 2 ) ), '<article class="dvdi-card">' ), 'Second page contains the remaining records' );
 $_GET = array();
 wp_set_current_user( 0 );
 check_dvdi( false !== strpos( DVD_Inventory::catalog(), 'This inventory is private' ), 'Anonymous users cannot view default inventory' );
 check_dvdi( false !== strpos( DVD_Inventory::catalog( array( 'public' => 'yes' ) ), 'DVDI The' ), 'Anonymous users can view explicitly public catalog' );
 $subscriber = wp_insert_user( array( 'user_login' => 'dvdi_test_' . wp_generate_password( 8, false ), 'user_pass' => wp_generate_password(), 'role' => 'subscriber' ) );
 if ( is_wp_error( $subscriber ) ) { throw new RuntimeException( $subscriber->get_error_message() ); }
 wp_set_current_user( $subscriber );
 check_dvdi( ! current_user_can( 'edit_post', $dvd ) && false !== strpos( DVD_Inventory::catalog(), 'This inventory is private' ), 'Subscribers lack editing and private catalog access' );
 save_dvdi( $dvd, array( 'quantity' => '888' ) );
 check_dvdi( '3' === get_post_meta( $dvd, '_dvdi_quantity', true ), 'Valid nonce alone cannot authorize a subscriber save' );
 $die_handler = function () { return function () { throw new RuntimeException( 'dvdi_denied' ); }; };
 add_filter( 'wp_die_handler', $die_handler );
 $denied = false;
 try { DVD_Inventory::export(); } catch ( RuntimeException $error ) { $denied = 'dvdi_denied' === $error->getMessage(); }
 check_dvdi( $denied, 'Subscribers cannot export inventory' );
 wp_set_current_user( $admins[0]->ID );
 $_REQUEST['_wpnonce'] = 'invalid';
 $denied = false;
 try { DVD_Inventory::export(); } catch ( RuntimeException $error ) { $denied = 'dvdi_denied' === $error->getMessage(); }
 check_dvdi( $denied, 'Administrator export still requires a valid nonce' );
 remove_filter( 'wp_die_handler', $die_handler );
 foreach ( array( '=SUM(A1)', " \t+CMD", '-2+3', '@SUM(A1)', "\r=CMD" ) as $cell ) {
  check_dvdi( "'" === substr( DVD_Inventory::csv_cell( $cell ), 0, 1 ), 'Spreadsheet formula is neutralized: ' . json_encode( $cell ) );
 }
 check_dvdi( '001234567890' === DVD_Inventory::csv_cell( '001234567890' ), 'CSV cell helper preserves ordinary UPC text' );
 wp_set_current_user( $admins[0]->ID );
 $_REQUEST['_wpnonce'] = wp_create_nonce( 'dvdi_export' );
 remove_action( 'shutdown', 'wp_ob_end_flush_all', 1 );
 ob_start();
 register_shutdown_function( function () use ( $dvd, $draft ) {
  $csv = ob_get_clean();
  try {
   $stream = fopen( 'php://memory', 'r+' );
   fwrite( $stream, $csv );
   rewind( $stream );
   $header = fgetcsv( $stream, 0, ',', '"', '' );
   $rows = array();
   while ( false !== ( $row = fgetcsv( $stream, 0, ',', '"', '' ) ) ) { $rows[$row[0]] = $row; }
   check_dvdi( 12 === count( $header ) && isset( $rows[$dvd], $rows[$draft] ), 'Actual CSV export includes published and draft records with 12 columns' );
   check_dvdi( '001234567890' === $rows[$dvd][3] && 'TOTE-SECRET-984' === $rows[$dvd][7] && 'PRIVATE-BORROWER-745 C:\DVDs\Loan' === $rows[$dvd][10], 'Actual CSV export preserves field order, UPC, location, and multiline-safe notes' );
   cleanup_dvdi();
   fwrite( STDERR, "All {$GLOBALS['checks']} integration checks passed on WordPress " . get_bloginfo( 'version' ) . ".\n" );
  } catch ( Throwable $error ) {
   cleanup_dvdi();
   fwrite( STDERR, 'FAIL: ' . $error->getMessage() . "\n" );
   exit( 1 );
  }
 } );
 DVD_Inventory::export();
} catch ( Throwable $error ) {
 cleanup_dvdi();
 fwrite( STDERR, 'FAIL: ' . $error->getMessage() . "\n" );
 exit( 1 );
}
