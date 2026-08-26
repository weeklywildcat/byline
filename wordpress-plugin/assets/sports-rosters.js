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
            rows[rows.length - 1].querySelector('input').focus();
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
    });
})();
