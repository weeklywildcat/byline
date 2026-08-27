(function () {
    function reindex(editor) {
        var kind = editor.dataset.rosterEditor;

        editor.querySelectorAll('.wwh-roster-row').forEach(function (row, index) {
            row.querySelectorAll('[name]').forEach(function (input) {
                input.name = input.name.replace(new RegExp('ww_roster_' + kind + '\\[\\d+\\]'), 'ww_roster_' + kind + '[' + index + ']');
            });
        });
    }

    document.addEventListener('click', function (event) {
        var addButton = event.target.closest('.wwh-roster-add-row');
        var removeButton = event.target.closest('.wwh-roster-remove-row');
        var moveUpButton = event.target.closest('.wwh-roster-move-up');
        var moveDownButton = event.target.closest('.wwh-roster-move-down');

        if (addButton) {
            event.preventDefault();
            var editor = addButton.closest('.wwh-roster-editor');
            var template = editor.querySelector('.wwh-roster-row-template');
            var fragment = template.content.cloneNode(true);
            editor.querySelector('.wwh-roster-rows').appendChild(fragment);
            reindex(editor);
            var rows = editor.querySelectorAll('.wwh-roster-row');
            var firstField = rows[rows.length - 1].querySelector('input:not([type="hidden"])');
            if (firstField) {
                firstField.focus();
            }
        }

        if (removeButton) {
            event.preventDefault();
            var removeEditor = removeButton.closest('.wwh-roster-editor');
            removeButton.closest('.wwh-roster-row').remove();
            reindex(removeEditor);
        }

        if (moveUpButton) {
            event.preventDefault();
            var upEditor = moveUpButton.closest('.wwh-roster-editor');
            var upRow = moveUpButton.closest('.wwh-roster-row');
            var previous = upRow.previousElementSibling;

            if (previous) {
                upRow.parentNode.insertBefore(upRow, previous);
                reindex(upEditor);
                moveUpButton.focus();
            }
        }

        if (moveDownButton) {
            event.preventDefault();
            var downEditor = moveDownButton.closest('.wwh-roster-editor');
            var downRow = moveDownButton.closest('.wwh-roster-row');
            var next = downRow.nextElementSibling;

            if (next) {
                downRow.parentNode.insertBefore(next, downRow);
                reindex(downEditor);
                moveDownButton.focus();
            }
        }

        var photoButton = event.target.closest('.wwh-roster-staff-photo-select');
        if (photoButton) {
            event.preventDefault();
            var photoRow = photoButton.closest('.wwh-roster-staff-row');
            var photoInput = photoRow.querySelector('.wwh-roster-staff-image-id');
            var preview = photoRow.querySelector('.wwh-roster-staff-preview');
            var photoRemove = photoRow.querySelector('.wwh-roster-staff-photo-remove');
            var frame = wp.media({
                title: 'Choose staff portrait',
                button: { text: 'Use portrait' },
                library: { type: 'image' },
                multiple: false
            });
            frame.on('select', function () {
                var attachment = frame.state().get('selection').first().toJSON();
                var sizes = attachment.sizes || {};
                photoInput.value = attachment.id;
                preview.src = sizes.medium ? sizes.medium.url : attachment.url;
                preview.hidden = false;
                photoRemove.hidden = false;
                photoButton.textContent = 'Replace photo';
            });
            frame.open();
        }

        var photoRemoveButton = event.target.closest('.wwh-roster-staff-photo-remove');
        if (photoRemoveButton) {
            event.preventDefault();
            var photoRemoveRow = photoRemoveButton.closest('.wwh-roster-staff-row');
            var removePreview = photoRemoveRow.querySelector('.wwh-roster-staff-preview');
            photoRemoveRow.querySelector('.wwh-roster-staff-image-id').value = '';
            removePreview.removeAttribute('src');
            removePreview.hidden = true;
            photoRemoveButton.hidden = true;
            photoRemoveRow.querySelector('.wwh-roster-staff-photo-select').textContent = 'Choose photo';
        }
    });
})();
