<?php

// Photo art direction: sanitizing a focal point and crop boxes, the automatic
// crop matching CSS object-position, which shapes get real cropped files, and
// cleanup of files from an earlier version. WordPress is stubbed; files are
// written to a temporary uploads folder.
define('ABSPATH', __DIR__ . '/../');

$art_meta = [];
$art_actions = [];
$art_uploads = sys_get_temp_dir() . '/byline-art-' . getmypid();
@mkdir($art_uploads . '/2026/11', 0777, true);
file_put_contents($art_uploads . '/2026/11/game.jpg', 'original');

function add_action(string $hook, $callback): void { global $art_actions; $art_actions[$hook][] = $callback; }
function register_post_meta(...$args): void {}
function current_user_can(...$args): bool { return true; }
function absint($value): int { return max(0, (int) abs((int) $value)); }
function trailingslashit(string $value): string { return rtrim($value, '/') . '/'; }
function wp_json_encode($value): string { return json_encode($value); }
function wp_get_upload_dir(): array { global $art_uploads; return ['basedir' => $art_uploads, 'baseurl' => 'https://cms.test/wp-content/uploads']; }
function get_post_meta(int $id, string $key, bool $single = false) { global $art_meta; return $art_meta[$id][$key] ?? ''; }
function update_post_meta(int $id, string $key, $value): void { global $art_meta; $art_meta[$id][$key] = $value; }
function delete_post_meta(int $id, string $key): void { global $art_meta; unset($art_meta[$id][$key]); }
function wp_delete_file(string $path): void { @unlink($path); }
function get_attached_file(int $id) { global $art_uploads; return $id === 77 ? $art_uploads . '/2026/11/game.jpg' : false; }
// A 3000x2000 landscape photograph.
function wp_get_attachment_metadata(int $id) { return $id === 77 ? ['width' => 3000, 'height' => 2000] : []; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
class WP_Error { public $code; public function __construct($code = '', $message = '', $data = []) { $this->code = $code; } }

$art_crops_made = [];
class Art_Test_Editor
{
    private $crop;
    public function crop($x, $y, $w, $h, $dw, $dh) { $this->crop = [$x, $y, $w, $h, $dw, $dh]; return true; }
    public function save(string $filename): array
    {
        global $art_crops_made;
        $art_crops_made[] = [basename($filename), $this->crop];
        file_put_contents($filename, 'crop');
        return ['path' => $filename, 'width' => $this->crop[4], 'height' => $this->crop[5]];
    }
}
function wp_get_image_editor(string $path) { return new Art_Test_Editor(); }

function art_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/content/image-art-direction.php';

// The shape table is the same one the site and the editor use.
$ts = file_get_contents(__DIR__ . '/../../packages/core/src/image-crops.ts');
preg_match_all('/(\w+): \{ label: "[^"]+", ratio: \[(\d+), (\d+)\], usedFor: "[^"]+", widths: \[([\d, ]+)\] \}/', $ts, $rows, PREG_SET_ORDER);
art_assert(count($rows) === count(BYLINE_IMAGE_CROP_SHAPES), 'Every TS crop shape must exist in PHP and the reverse.');
foreach ($rows as [, $shape, $width, $height, $widths]) {
    $php = BYLINE_IMAGE_CROP_SHAPES[$shape] ?? null;
    art_assert($php !== null, "PHP is missing the {$shape} shape.");
    art_assert([$php[0], $php[1]] === [(int) $width, (int) $height], "The {$shape} ratio differs between PHP and TS.");
    art_assert($php[2] === array_map('intval', explode(', ', $widths)), "The {$shape} rendition widths differ between PHP and TS.");
}

// Sanitizing.
art_assert(byline_image_focal_point(['x' => 140, 'y' => -2]) === ['x' => 100.0, 'y' => 0.0], 'Focal points are clamped to 0-100.');
art_assert(byline_image_focal_point(['x' => 'left']) === null, 'A malformed focal point is ignored.');
art_assert(byline_image_crop_rect(['x' => 0.8, 'y' => 0, 'w' => 0.5, 'h' => 1]) === null, 'A crop outside the image is rejected.');
art_assert(array_keys(byline_image_crop_rects(['square' => ['x' => 0, 'y' => 0, 'w' => 0.5, 'h' => 1], 'banner' => ['x' => 0, 'y' => 0, 'w' => 1, 'h' => 1]])) === ['square'], 'Unknown shapes are dropped.');

// The automatic crop is what CSS shows at that object-position.
$auto = byline_image_auto_crop('square', ['x' => 25, 'y' => 50], 3000, 2000);
art_assert(abs($auto['w'] - 2 / 3) < 1e-9 && abs($auto['x'] - (1 / 3) * 0.25) < 1e-9 && $auto['h'] === 1.0, 'The automatic square crop must match CSS object-position.');
art_assert(!byline_image_is_custom_crop($auto, $auto), 'The automatic crop is not custom.');

// Unused images have no art direction (nothing is published for them).
art_assert(byline_image_art_direction(77) === null, 'An image nobody art-directed has no art direction.');

// A focal point plus one custom square crop: files for square and social only.
$square = ['x' => 0.4, 'y' => 0.1, 'w' => 0.3, 'h' => 0.45];
$saved = byline_image_save_art_direction(77, ['x' => 30, 'y' => 20], ['square' => $square, 'wide' => byline_image_auto_crop('wide', ['x' => 30, 'y' => 20], 3000, 2000)]);
$renditions = (array) $saved['renditions'];
art_assert(array_keys($renditions) === ['square', 'social'], 'Only a custom crop and the social card get files; an automatic crop is CSS only.');
art_assert(array_column($renditions['square'], 'width') === [320, 640], 'A 900px-wide crop is not upscaled to 1080.');
art_assert($renditions['social'][0]['width'] === 1200 && $renditions['social'][0]['height'] === 630, 'The social card is 1200x630.');
art_assert(strpos($renditions['square'][0]['url'], 'https://cms.test/wp-content/uploads/2026/11/game-byline-square-320x320-') === 0, 'Renditions are uploads URLs next to the original.');
art_assert($art_crops_made[0][1] === [1200, 200, 900, 900, 320, 320], 'The crop box is converted to source pixels.');
art_assert($saved['focalPoint'] === ['x' => 30.0, 'y' => 20.0], 'The focal point is stored.');

// Changing the crop replaces the files, and stale ones are deleted.
$old = $art_uploads . '/' . $art_meta[77][BYLINE_IMAGE_RENDITIONS_META]['square'][0]['file'];
art_assert(is_file($old), 'The first version wrote its files.');
byline_image_save_art_direction(77, ['x' => 30, 'y' => 20], ['square' => ['x' => 0.1, 'y' => 0.1, 'w' => 0.3, 'h' => 0.45]]);
art_assert(!is_file($old), 'Files from an earlier crop are removed.');

// The site's HTML helper uses the files, or the focal point with the normal image.
$attributes = byline_image_shape_attributes(77, 'square');
art_assert(strpos($attributes['srcset'], ' 320w, ') !== false && $attributes['style'] === '', 'A shape with files uses them.');

// Clearing everything removes the meta and the files.
$current = $art_uploads . '/' . $art_meta[77][BYLINE_IMAGE_RENDITIONS_META]['social'][0]['file'];
art_assert(byline_image_save_art_direction(77, null, null) === null, 'Clearing returns no art direction.');
art_assert(!is_file($current) && empty($art_meta[77]), 'Clearing deletes files and meta.');

// Deleting the attachment deletes its cropped files.
art_assert(in_array('byline_image_delete_attachment_renditions', $art_actions['delete_attachment'] ?? [], true), 'Cropped files are deleted with the attachment.');

// The snapshot publishes artDirection, and its meta keys republish the site.
$snapshot = file_get_contents(__DIR__ . '/../includes/publication/build-snapshot.php');
art_assert(strpos($snapshot, "'acquireLicensePage', 'artDirection']") !== false, 'The build snapshot must carry artDirection.');
$revisions = file_get_contents(__DIR__ . '/../includes/publication/public-revisions.php');
art_assert(strpos($revisions, "strpos(\$key, '_byline_image_') === 0") !== false && strpos(BYLINE_IMAGE_CROPS_META, '_byline_image_') === 0, 'Art direction changes must republish.');

array_map('unlink', glob($art_uploads . '/2026/11/*'));
echo "image art direction regression passed\n";
