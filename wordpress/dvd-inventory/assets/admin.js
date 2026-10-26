(function ($) {
  'use strict';
  $(function () {
    let picker;
    $('#dvdi-cover-choose').on('click', function () {
      if (!picker) {
        picker = wp.media({ title: 'Choose DVD cover', button: { text: 'Use this cover' }, library: { type: 'image' }, multiple: false });
        picker.on('select', function () {
          const item = picker.state().get('selection').first().toJSON();
          const source = item.sizes && item.sizes.thumbnail ? item.sizes.thumbnail.url : item.url;
          $('#dvdi-cover').val(item.id);
          $('#dvdi-cover-preview').empty().append($('<img>', { src: source, alt: 'Selected DVD cover', width: 150 }));
        });
      }
      picker.open();
    });
    $('#dvdi-cover-remove').on('click', function () {
      $('#dvdi-cover').val('0');
      $('#dvdi-cover-preview').empty();
    });
  });
})(jQuery);
