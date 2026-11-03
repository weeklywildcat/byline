<?php

/**
 * Photo art direction: an editor's focal point and per-shape crop boxes for an
 * attachment (NYT-style "crops"). Stored on the attachment, so a photo is
 * cropped once and every story that uses it agrees.
 *
 * The focal point is applied by the site with CSS `object-position`, which is
 * exact for every cover crop and needs no files. Only a crop box the editor
 * drew away from the automatic one gets real cropped files ("renditions"), and
 * `social` always gets one 1200x630 file because social platforms crop on their
 * own. Renditions live in their own meta, never in `_wp_attachment_metadata`,
 * so Core's srcset never mixes a cropped file into a normal photograph.
 *
 * The shape table mirrors `packages/core/src/image-crops.ts`
 * (tests/image-art-direction-regression.php checks they match).
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_IMAGE_FOCAL_META = '_byline_image_focal';
const BYLINE_IMAGE_CROPS_META = '_byline_image_crops';
const BYLINE_IMAGE_RENDITIONS_META = '_byline_image_renditions';

/** shape => [ratio width, ratio height, rendition widths] */
const BYLINE_IMAGE_CROP_SHAPES = [
    'wide' => [16, 9, [640, 1280, 1920]],
    'card' => [3, 2, [480, 960, 1440]],
    'standard' => [4, 3, [480, 960, 1440]],
    'square' => [1, 1, [320, 640, 1080]],
    'portrait' => [4, 5, [400, 800, 1200]],
    'social' => [1200, 630, [1200]],
];

const BYLINE_IMAGE_CROP_EPSILON = 0.005;

function byline_register_image_art_direction_meta(): void
{
    foreach ([BYLINE_IMAGE_FOCAL_META, BYLINE_IMAGE_CROPS_META, BYLINE_IMAGE_RENDITIONS_META] as $key) {
        register_post_meta('attachment', $key, [
            'single' => true,
            'type' => 'object',
            'show_in_rest' => false,
            'auth_callback' => static fn() => current_user_can('upload_files'),
        ]);
    }
}
add_action('init', 'byline_register_image_art_direction_meta');

function byline_image_focal_point($value): ?array
{
    if (!is_array($value) || !isset($value['x'], $value['y']) || !is_numeric($value['x']) || !is_numeric($value['y'])) return null;
    return [
        'x' => round(max(0.0, min(100.0, (float) $value['x'])), 2),
        'y' => round(max(0.0, min(100.0, (float) $value['y'])), 2),
    ];
}

function byline_image_crop_rect($value): ?array
{
    if (!is_array($value)) return null;
    foreach (['x', 'y', 'w', 'h'] as $key) {
        if (!isset($value[$key]) || !is_numeric($value[$key]) || !is_finite((float) $value[$key])) return null;
    }
    $rect = ['x' => (float) $value['x'], 'y' => (float) $value['y'], 'w' => (float) $value['w'], 'h' => (float) $value['h']];
    if ($rect['w'] <= 0 || $rect['h'] <= 0 || $rect['x'] < 0 || $rect['y'] < 0) return null;
    if ($rect['x'] + $rect['w'] > 1 + BYLINE_IMAGE_CROP_EPSILON || $rect['y'] + $rect['h'] > 1 + BYLINE_IMAGE_CROP_EPSILON) return null;
    $rect['w'] = min($rect['w'], 1 - $rect['x']);
    $rect['h'] = min($rect['h'], 1 - $rect['y']);
    return $rect;
}

/** Keeps only known shapes with valid boxes. */
function byline_image_crop_rects($value): array
{
    $crops = [];
    if (!is_array($value)) return $crops;
    foreach (array_keys(BYLINE_IMAGE_CROP_SHAPES) as $shape) {
        $rect = byline_image_crop_rect($value[$shape] ?? null);
        if ($rect) $crops[$shape] = $rect;
    }
    return $crops;
}

/** The crop CSS shows with object-fit: cover at this focal point (same rule as autoCrop() in TS). */
function byline_image_auto_crop(string $shape, ?array $focal, int $width, int $height): array
{
    $focal = $focal ?: ['x' => 50, 'y' => 50];
    if ($width <= 0 || $height <= 0 || !isset(BYLINE_IMAGE_CROP_SHAPES[$shape])) return ['x' => 0.0, 'y' => 0.0, 'w' => 1.0, 'h' => 1.0];
    [$ratio_width, $ratio_height] = BYLINE_IMAGE_CROP_SHAPES[$shape];
    $target = $ratio_width / $ratio_height;
    $source = $width / $height;
    if ($source > $target) {
        $w = $target / $source;
        return ['x' => (1 - $w) * ($focal['x'] / 100), 'y' => 0.0, 'w' => $w, 'h' => 1.0];
    }
    $h = $source / $target;
    return ['x' => 0.0, 'y' => (1 - $h) * ($focal['y'] / 100), 'w' => 1.0, 'h' => $h];
}

function byline_image_is_custom_crop(?array $crop, array $auto): bool
{
    if (!$crop) return false;
    foreach (['x', 'y', 'w', 'h'] as $key) {
        if (abs($crop[$key] - $auto[$key]) > BYLINE_IMAGE_CROP_EPSILON) return true;
    }
    return false;
}

/** [width, height] of the attachment file the site shows (the -scaled copy for big uploads). */
function byline_image_dimensions(int $attachment_id): array
{
    $metadata = wp_get_attachment_metadata($attachment_id);
    return [absint($metadata['width'] ?? 0), absint($metadata['height'] ?? 0)];
}

/**
 * Public art direction for an attachment, or null when an editor never set any.
 * Rendition files are stored relative to the uploads folder and returned as URLs.
 */
function byline_image_art_direction(int $attachment_id): ?array
{
    if ($attachment_id <= 0) return null;
    $focal = byline_image_focal_point(get_post_meta($attachment_id, BYLINE_IMAGE_FOCAL_META, true));
    $crops = byline_image_crop_rects(get_post_meta($attachment_id, BYLINE_IMAGE_CROPS_META, true));
    $stored = get_post_meta($attachment_id, BYLINE_IMAGE_RENDITIONS_META, true);
    $renditions = [];
    if (is_array($stored)) {
        $base_url = trailingslashit(wp_get_upload_dir()['baseurl']);
        foreach ($stored as $shape => $files) {
            if (!isset(BYLINE_IMAGE_CROP_SHAPES[$shape]) || !is_array($files)) continue;
            foreach ($files as $file) {
                if (!is_array($file) || empty($file['file'])) continue;
                $renditions[$shape][] = [
                    'url' => $base_url . ltrim((string) $file['file'], '/'),
                    'width' => absint($file['width'] ?? 0),
                    'height' => absint($file['height'] ?? 0),
                ];
            }
        }
    }
    if (!$focal && !$crops && !$renditions) return null;
    return [
        'focalPoint' => $focal ?: ['x' => 50, 'y' => 50],
        // Empty objects, not lists, so JSON consumers always see a map.
        'crops' => (object) $crops,
        'renditions' => (object) $renditions,
    ];
}

/** Deletes every generated file recorded for the attachment. */
function byline_image_delete_renditions(int $attachment_id, array $keep = []): void
{
    $stored = get_post_meta($attachment_id, BYLINE_IMAGE_RENDITIONS_META, true);
    if (!is_array($stored)) return;
    $base_dir = trailingslashit(wp_get_upload_dir()['basedir']);
    foreach ($stored as $files) {
        foreach ((array) $files as $file) {
            $relative = is_array($file) ? (string) ($file['file'] ?? '') : '';
            if ($relative === '' || in_array($relative, $keep, true) || strpos($relative, '..') !== false) continue;
            $path = $base_dir . ltrim($relative, '/');
            if (is_file($path)) wp_delete_file($path);
        }
    }
}

/** Removes cropped files with the attachment. */
function byline_image_delete_attachment_renditions($attachment_id): void
{
    byline_image_delete_renditions((int) $attachment_id);
}
add_action('delete_attachment', 'byline_image_delete_attachment_renditions');

/**
 * Writes the cropped files: custom crops for any shape, plus social always.
 * Returns shape => [[file, width, height], ...] (file relative to uploads), or a WP_Error.
 */
function byline_image_generate_renditions(int $attachment_id)
{
    $source = get_attached_file($attachment_id);
    if (!$source || !is_file($source)) return new WP_Error('byline_image_missing_file', 'The original image file is missing.', ['status' => 404]);
    [$width, $height] = byline_image_dimensions($attachment_id);
    if (!$width || !$height) return new WP_Error('byline_image_no_dimensions', 'This file has no image dimensions.', ['status' => 400]);

    $focal = byline_image_focal_point(get_post_meta($attachment_id, BYLINE_IMAGE_FOCAL_META, true));
    $crops = byline_image_crop_rects(get_post_meta($attachment_id, BYLINE_IMAGE_CROPS_META, true));
    $uploads = wp_get_upload_dir();
    $base_dir = trailingslashit($uploads['basedir']);
    $info = pathinfo($source);
    $extension = strtolower($info['extension'] ?? 'jpg');
    $renditions = [];

    foreach (BYLINE_IMAGE_CROP_SHAPES as $shape => [$ratio_width, $ratio_height, $widths]) {
        $auto = byline_image_auto_crop($shape, $focal, $width, $height);
        $crop = $crops[$shape] ?? null;
        if (!byline_image_is_custom_crop($crop, $auto)) {
            if ($shape !== 'social') continue;
            $crop = $auto;
        }
        $src_x = (int) round($crop['x'] * $width);
        $src_y = (int) round($crop['y'] * $height);
        $src_w = max(1, (int) round($crop['w'] * $width));
        $src_h = max(1, (int) round($crop['h'] * $height));
        // Never upscale: a crop narrower than the smallest width gets one file at its own size.
        $targets = array_values(array_filter($widths, static fn($target) => $target <= $src_w));
        if (!$targets) $targets = [$src_w];
        $digest = substr(md5(wp_json_encode([$crop, $width, $height])), 0, 8);

        foreach ($targets as $target_width) {
            $target_height = (int) round($target_width * $ratio_height / $ratio_width);
            $editor = wp_get_image_editor($source);
            if (is_wp_error($editor)) return $editor;
            $cropped = $editor->crop($src_x, $src_y, $src_w, $src_h, $target_width, $target_height);
            if (is_wp_error($cropped)) return $cropped;
            $filename = sprintf('%s/%s-byline-%s-%dx%d-%s.%s', $info['dirname'], $info['filename'], $shape, $target_width, $target_height, $digest, $extension);
            $saved = $editor->save($filename);
            if (is_wp_error($saved)) return $saved;
            $relative = ltrim(str_replace($base_dir, '', (string) $saved['path']), '/');
            $renditions[$shape][] = ['file' => $relative, 'width' => absint($saved['width']), 'height' => absint($saved['height'])];
        }
    }

    return $renditions;
}

/**
 * Saves an editor's focal point and crops, rebuilds the cropped files and
 * removes the files of the previous version. A null focal point and no crops
 * clears the art direction.
 */
function byline_image_save_art_direction(int $attachment_id, $focal_value, $crops_value)
{
    $focal = byline_image_focal_point($focal_value);
    $crops = byline_image_crop_rects($crops_value);

    if (!$focal && !$crops) {
        byline_image_delete_renditions($attachment_id);
        delete_post_meta($attachment_id, BYLINE_IMAGE_FOCAL_META);
        delete_post_meta($attachment_id, BYLINE_IMAGE_CROPS_META);
        delete_post_meta($attachment_id, BYLINE_IMAGE_RENDITIONS_META);
        return null;
    }

    update_post_meta($attachment_id, BYLINE_IMAGE_FOCAL_META, $focal ?: ['x' => 50, 'y' => 50]);
    if ($crops) update_post_meta($attachment_id, BYLINE_IMAGE_CROPS_META, $crops);
    else delete_post_meta($attachment_id, BYLINE_IMAGE_CROPS_META);

    $renditions = byline_image_generate_renditions($attachment_id);
    if (is_wp_error($renditions)) return $renditions;
    $keep = [];
    foreach ($renditions as $files) foreach ($files as $file) $keep[] = $file['file'];
    byline_image_delete_renditions($attachment_id, $keep);
    update_post_meta($attachment_id, BYLINE_IMAGE_RENDITIONS_META, $renditions);

    return byline_image_art_direction($attachment_id);
}

/**
 * `src`, `srcset`, `width`, `height` and an `object-position` style for a shape,
 * for HTML WordPress renders itself (Related Coverage, Discord).
 */
function byline_image_shape_attributes(int $attachment_id, string $shape, string $fallback_size = 'large'): array
{
    $art = byline_image_art_direction($attachment_id);
    // An unknown shape (callers pass 'none') only applies the focal point.
    $files = $art ? ((array) $art['renditions'])[$shape] ?? [] : [];
    if ($files) {
        $largest = end($files);
        return [
            'src' => $largest['url'],
            'srcset' => implode(', ', array_map(static fn($file) => $file['url'] . ' ' . $file['width'] . 'w', $files)),
            'width' => $largest['width'],
            'height' => $largest['height'],
            'style' => '',
        ];
    }
    $image = wp_get_attachment_image_src($attachment_id, $fallback_size);
    $focal = $art['focalPoint'] ?? null;
    return [
        'src' => $image ? (string) $image[0] : '',
        'srcset' => '',
        'width' => $image ? absint($image[1]) : 0,
        'height' => $image ? absint($image[2]) : 0,
        'style' => $focal && ($focal['x'] != 50 || $focal['y'] != 50) ? sprintf('object-position:%s%% %s%%', $focal['x'], $focal['y']) : '',
    ];
}

/** The editor's 1200x630 social card, or '' (Discord and other embeds crop anything else themselves). */
function byline_image_social_url(int $attachment_id): string
{
    $art = byline_image_art_direction($attachment_id);
    $files = $art ? ((array) $art['renditions'])['social'] ?? [] : [];
    return $files ? (string) end($files)['url'] : '';
}

function byline_image_art_direction_permission(WP_REST_Request $request)
{
    $attachment_id = absint($request['id']);
    // Capabilities first, so the route does not reveal which attachments exist.
    if (!current_user_can('upload_files')) return false;
    $post = get_post($attachment_id);
    if (!$post instanceof WP_Post || $post->post_type !== 'attachment' || !wp_attachment_is_image($attachment_id)) {
        return new WP_Error('byline_image_not_found', 'That image does not exist.', ['status' => 404]);
    }
    return current_user_can('edit_post', $attachment_id);
}

/** What the crop dialog needs: the image, its size, and the current art direction. */
function byline_image_art_direction_response(int $attachment_id): array
{
    [$width, $height] = byline_image_dimensions($attachment_id);
    return [
        'id' => $attachment_id,
        'url' => (string) wp_get_attachment_url($attachment_id),
        'previewUrl' => (string) (wp_get_attachment_image_src($attachment_id, 'large')[0] ?? wp_get_attachment_url($attachment_id)),
        'width' => $width,
        'height' => $height,
        'alt' => (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true),
        'artDirection' => byline_image_art_direction($attachment_id),
    ];
}

function byline_image_art_direction_rest_get(WP_REST_Request $request): WP_REST_Response
{
    return rest_ensure_response(byline_image_art_direction_response(absint($request['id'])));
}

function byline_image_art_direction_rest_save(WP_REST_Request $request)
{
    $attachment_id = absint($request['id']);
    $saved = byline_image_save_art_direction($attachment_id, $request->get_param('focalPoint'), $request->get_param('crops'));
    if (is_wp_error($saved)) return $saved;
    return rest_ensure_response(byline_image_art_direction_response($attachment_id));
}

function byline_register_image_art_direction_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/media/(?P<id>\d+)/art-direction', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_image_art_direction_rest_get',
            'permission_callback' => 'byline_image_art_direction_permission',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_image_art_direction_rest_save',
            'permission_callback' => 'byline_image_art_direction_permission',
            'args' => [
                'focalPoint' => ['type' => ['object', 'null']],
                'crops' => ['type' => ['object', 'null']],
            ],
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_image_art_direction_routes');
