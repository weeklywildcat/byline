<?php
/**
 * Read-only WordPress -> Byline native migration export.
 *
 * Run from the repository checkout on the Docker host:
 *   docker exec -i weeklywildcat-wordpress php < migration/export-wordpress-native.php > /opt/byline/wordpress-native.json
 *
 * The exporter never writes WordPress. It emits a narrow, versioned JSON
 * contract containing only the records and attachment metadata the Payload
 * importer needs. Gutenberg is converted to Byline's CMS-independent
 * ArticleBody shape here, while WordPress still has the authoritative parser.
 */

require '/var/www/html/wp-load.php';

if (!class_exists('DOMDocument')) {
    fwrite(STDERR, "PHP DOMDocument is required for native inline-markup conversion.\n");
    exit(2);
}

const BYLINE_NATIVE_EXPORT_VERSION = 1;

function ww_text($value): string {
    return is_scalar($value) ? trim((string) $value) : '';
}

function ww_inline_walk(DOMNode $node, bool $bold = false, bool $italic = false): array {
    if ($node instanceof DOMText) {
        $text = $node->nodeValue ?? '';
        if ($text === '') return [];
        $run = ['type' => 'text', 'text' => $text];
        if ($bold) $run['bold'] = true;
        if ($italic) $run['italic'] = true;
        return [$run];
    }
    if (!($node instanceof DOMElement)) return [];
    $tag = strtolower($node->tagName);
    if ($tag === 'br') return [['type' => 'lineBreak']];
    $nextBold = $bold || $tag === 'strong' || $tag === 'b';
    $nextItalic = $italic || $tag === 'em' || $tag === 'i';
    if ($tag === 'a') {
        $runs = [];
        foreach ($node->childNodes as $child) {
            foreach (ww_inline_walk($child, $nextBold, $nextItalic) as $item) {
                if (($item['type'] ?? '') === 'text') $runs[] = $item;
            }
        }
        $href = trim((string) $node->getAttribute('href'));
        if ($href !== '' && $href[0] === '/') $href = home_url($href);
        if ($href !== '' && preg_match('~^https?://~i', $href) && $runs) {
            return [['type' => 'link', 'href' => $href, 'children' => $runs]];
        }
        return $runs;
    }
    $out = [];
    foreach ($node->childNodes as $child) {
        array_push($out, ...ww_inline_walk($child, $nextBold, $nextItalic));
    }
    return $out;
}

function ww_dom(string $html): DOMDocument {
    $doc = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><html><body><div id="byline-root">' . $html . '</div></body></html>', LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($old);
    return $doc;
}

function ww_first_element(string $html, array $tags): ?DOMElement {
    $doc = ww_dom($html);
    foreach ($tags as $tag) {
        $nodes = $doc->getElementsByTagName($tag);
        if ($nodes->length && $nodes->item(0) instanceof DOMElement) return $nodes->item(0);
    }
    return null;
}

function ww_inline_html(string $html, array $tags = ['p']): array {
    $element = ww_first_element($html, $tags);
    if (!$element) return [];
    $out = [];
    foreach ($element->childNodes as $child) array_push($out, ...ww_inline_walk($child));
    return $out;
}

function ww_plain_caption(string $html): string {
    if (!preg_match('~<figcaption\\b[^>]*>(.*?)</figcaption>~is', $html, $match)) return '';
    return trim(wp_strip_all_tags(html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

function ww_block_id(int $postId, int &$sequence, string $kind): string {
    $sequence++;
    return 'wp-' . $postId . '-' . $kind . '-' . $sequence;
}

function ww_list_block(array $block, int $postId, int &$sequence): array {
    $items = [];
    foreach (($block['innerBlocks'] ?? []) as $child) {
        if (($child['blockName'] ?? '') !== 'core/list-item') continue;
        $children = ww_inline_html((string) ($child['innerHTML'] ?? ''), ['li']);
        $item = ['children' => $children];
        foreach (($child['innerBlocks'] ?? []) as $nested) {
            if (($nested['blockName'] ?? '') === 'core/list') {
                $item['list'] = ww_list_block($nested, $postId, $sequence);
                break;
            }
        }
        if ($children || isset($item['list'])) $items[] = $item;
    }
    $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    return ['type' => 'list', 'ordered' => (($attrs['ordered'] ?? false) === true), 'items' => $items];
}

function ww_image_node(array $block, int $postId, int &$sequence): ?array {
    $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $media = absint($attrs['id'] ?? 0);
    if ($media <= 0) return null;
    $align = (string) ($attrs['align'] ?? '');
    return [
        'type' => 'photo',
        'id' => ww_block_id($postId, $sequence, 'photo'),
        'media' => $media,
        'caption' => ww_plain_caption((string) ($block['innerHTML'] ?? '')),
        'altOverride' => ww_text($attrs['alt'] ?? ''),
        'placement' => $align === 'full' ? 'full' : ($align === 'wide' ? 'wide' : 'column'),
    ];
}

function ww_gallery_node(array $block, int $postId, int &$sequence): ?array {
    $items = [];
    foreach (($block['innerBlocks'] ?? []) as $image) {
        if (($image['blockName'] ?? '') !== 'core/image') continue;
        $attrs = is_array($image['attrs'] ?? null) ? $image['attrs'] : [];
        $media = absint($attrs['id'] ?? 0);
        if ($media <= 0) continue;
        $items[] = [
            'id' => ww_block_id($postId, $sequence, 'gallery-item'),
            'media' => $media,
            'caption' => ww_plain_caption((string) ($image['innerHTML'] ?? '')),
            'altOverride' => ww_text($attrs['alt'] ?? ''),
        ];
    }
    if (!$items) return null;
    $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    return [
        'type' => 'gallery',
        'id' => ww_block_id($postId, $sequence, 'gallery'),
        'items' => $items,
        'fit' => array_key_exists('imageCrop', $attrs) && $attrs['imageCrop'] === false ? 'natural' : 'crop',
    ];
}

function ww_datawrapper_node(array $block, int $postId, int &$sequence): ?array {
    $html = (string) ($block['innerHTML'] ?? '');
    if (!preg_match('~https://datawrapper\\.dwcdn\\.net/[^"\\s<]+~i', $html, $url)) return null;
    $title = 'Datawrapper graphic';
    if (preg_match("~<iframe\\b[^>]*\\btitle=[\"']([^\"']+)[\"']~i", $html, $match)) {
        $title = html_entity_decode($match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
    $isMap = preg_match("~aria-label=[\"'][^\"']*map~i", $html) === 1;
    return [
        'type' => 'chartMap',
        'id' => ww_block_id($postId, $sequence, 'chart-map'),
        'mode' => 'interactive',
        'url' => $url[0],
        'image' => null,
        'title' => $title,
        'dek' => '',
        'summary' => $title,
        'source' => '',
        'notes' => '',
        'credit' => '',
        'height' => $isMap ? 'map' : 'standard',
    ];
}

function ww_convert_blocks(array $blocks, int $postId, int &$sequence, array &$correctionBlocks, array &$warnings, array &$errors): array {
    $nodes = [];
    foreach ($blocks as $block) {
        $name = $block['blockName'] ?? null;
        if ($name === null) {
            if (trim((string) ($block['innerHTML'] ?? '')) !== '') $errors[] = "Post {$postId}: non-empty unlabelled HTML.";
            continue;
        }
        if ($name === 'core/paragraph') {
            $children = ww_inline_html((string) ($block['innerHTML'] ?? ''), ['p']);
            if ($children) $nodes[] = ['type' => 'paragraph', 'children' => $children];
            continue;
        }
        if ($name === 'core/heading') {
            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $level = (int) ($attrs['level'] ?? 2);
            $level = $level <= 2 ? 2 : 3;
            $children = ww_inline_html((string) ($block['innerHTML'] ?? ''), ['h2', 'h3', 'h1', 'h4', 'h5', 'h6']);
            if ($children) $nodes[] = ['type' => 'heading', 'level' => $level, 'children' => $children];
            continue;
        }
        if ($name === 'core/list') {
            $list = ww_list_block($block, $postId, $sequence);
            if ($list['items']) $nodes[] = $list;
            continue;
        }
        if ($name === 'core/list-item') continue;
        if ($name === 'core/image') {
            $node = ww_image_node($block, $postId, $sequence);
            if ($node) $nodes[] = $node;
            else $errors[] = "Post {$postId}: image block without an attachment ID.";
            continue;
        }
        if ($name === 'core/gallery') {
            $node = ww_gallery_node($block, $postId, $sequence);
            if ($node) $nodes[] = $node;
            else $errors[] = "Post {$postId}: empty gallery.";
            continue;
        }
        if ($name === 'core/file') {
            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $media = absint($attrs['id'] ?? 0);
            if ($media <= 0) {
                $errors[] = "Post {$postId}: file block without an attachment ID.";
                continue;
            }
            $attachment = get_post($media);
            $nodes[] = [
                'type' => 'document',
                'id' => ww_block_id($postId, $sequence, 'document'),
                'media' => $media,
                'title' => $attachment instanceof WP_Post ? (string) $attachment->post_title : '',
                'context' => '',
                'source' => '',
                'pages' => [],
            ];
            continue;
        }
        if ($name === 'core/media-text') {
            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $media = absint($attrs['mediaId'] ?? 0);
            if ($media > 0 && ($attrs['mediaType'] ?? 'image') === 'image') {
                $nodes[] = [
                    'type' => 'photo',
                    'id' => ww_block_id($postId, $sequence, 'photo'),
                    'media' => $media,
                    'caption' => '',
                    'altOverride' => '',
                    'placement' => 'column',
                ];
            }
            array_push($nodes, ...ww_convert_blocks((array) ($block['innerBlocks'] ?? []), $postId, $sequence, $correctionBlocks, $warnings, $errors));
            continue;
        }
        if ($name === 'core/embed') {
            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $url = ww_text($attrs['url'] ?? '');
            $provider = strtolower(ww_text($attrs['providerNameSlug'] ?? ''));
            if ($provider === 'youtube' && $url !== '') {
                $nodes[] = [
                    'type' => 'video',
                    'id' => ww_block_id($postId, $sequence, 'video'),
                    'videoId' => null,
                    'title' => 'YouTube video',
                    'caption' => '',
                    'captionsConfirmed' => true,
                    '_sourceUrl' => $url,
                ];
            } elseif ($url !== '') {
                $nodes[] = ['type' => 'paragraph', 'children' => [[
                    'type' => 'link', 'href' => $url, 'children' => [['type' => 'text', 'text' => $url]]
                ]]];
                $warnings[] = "Post {$postId}: {$provider} embed converted to a normal link.";
            }
            continue;
        }
        if ($name === 'core/quote') {
            array_push($nodes, ...ww_convert_blocks((array) ($block['innerBlocks'] ?? []), $postId, $sequence, $correctionBlocks, $warnings, $errors));
            continue;
        }
        if ($name === 'byline/correction-notice') {
            $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
            $correctionBlocks[] = [
                'legacyId' => null,
                'type' => ww_text($attrs['type'] ?? 'correction'),
                'text' => ww_text($attrs['notice'] ?? ''),
                'date' => ww_text($attrs['date'] ?? ''),
                'source' => 'block',
            ];
            continue;
        }
        if ($name === 'core/html') {
            $node = ww_datawrapper_node($block, $postId, $sequence);
            if ($node) $nodes[] = $node;
            else $errors[] = "Post {$postId}: unsupported core/html block.";
            continue;
        }
        $errors[] = "Post {$postId}: unsupported block {$name}.";
    }
    return $nodes;
}

function ww_block_media_fallback(array $block, int $id): ?array {
    $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
    $html = (string) ($block['innerHTML'] ?? '');
    $candidates = [];

    $push = static function ($value) use (&$candidates): void {
        if (!is_string($value)) return;
        $value = html_entity_decode(trim($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($value === '' || !preg_match('~^https?://~i', $value)) return;
        if (!in_array($value, $candidates, true)) $candidates[] = $value;
    };

    if (($block['blockName'] ?? '') === 'core/file') $push($attrs['href'] ?? '');

    if (preg_match_all("~src=[\"']([^\"']+)[\"']~i", $html, $matches)) {
        foreach ($matches[1] as $url) $push($url);
    }
    if (preg_match_all("~srcset=[\"']([^\"']+)[\"']~i", $html, $matches)) {
        foreach ($matches[1] as $srcset) {
            foreach (explode(',', html_entity_decode($srcset, ENT_QUOTES | ENT_HTML5, 'UTF-8')) as $candidate) {
                $parts = preg_split('/\\s+/', trim($candidate));
                $push($parts[0] ?? '');
            }
        }
    }
    if (!$candidates) return null;

    $inlineDataBase64 = '';
    $inlineBytes = 0;
    $uploads = wp_get_upload_dir();
    $uploadBase = isset($uploads['basedir']) ? realpath((string) $uploads['basedir']) : false;
    if ($uploadBase) {
        foreach ($candidates as $candidateUrl) {
            $candidatePath = rawurldecode((string) parse_url($candidateUrl, PHP_URL_PATH));
            if (!preg_match('~/wp-content/uploads/(.+)$~', $candidatePath, $match)) continue;
            $local = realpath($uploadBase . DIRECTORY_SEPARATOR . ltrim($match[1], '/'));
            if (!$local || strpos($local, $uploadBase . DIRECTORY_SEPARATOR) !== 0 || !is_file($local)) continue;
            $size = filesize($local);
            if ($size === false || $size <= 0 || $size > 50 * 1024 * 1024) continue;
            $bytes = file_get_contents($local);
            if ($bytes === false || strlen($bytes) !== $size) continue;
            $inlineDataBase64 = base64_encode($bytes);
            $inlineBytes = $size;
            break;
        }
    }

    $url = $candidates[0];
    $path = (string) parse_url($url, PHP_URL_PATH);
    $filename = basename($path);
    $filetype = wp_check_filetype($filename);
    $mime = ww_text($filetype['type'] ?? '');
    if ($mime === '') {
        if (($block['blockName'] ?? '') === 'core/image' || ($attrs['mediaType'] ?? '') === 'image') $mime = 'image/jpeg';
        else return null;
    }

    return [
        'id' => $id,
        'url' => $url,
        'candidateUrls' => $candidates,
        'inlineDataBase64' => $inlineDataBase64 !== '' ? $inlineDataBase64 : null,
        'inlineBytes' => $inlineBytes ?: null,
        'filename' => $filename !== '' ? $filename : ('wordpress-media-' . $id),
        'mimeType' => $mime,
        'alt' => ww_text($attrs['alt'] ?? ''),
        'caption' => ww_plain_caption($html),
        'creator' => '',
        'credit' => '',
        'copyright' => '',
        'license' => '',
        'sourceUrl' => '',
        'capturedAt' => '',
        'artDirection' => null,
        'recoveredFromBlock' => true,
    ];
}

function ww_collect_attachment_ids(array $blocks, array &$ids, array &$fallbacks): void {
    foreach ($blocks as $block) {
        $name = $block['blockName'] ?? null;
        $attrs = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
        $keys = $name === 'core/media-text' ? ['mediaId'] : (in_array($name, ['core/image', 'core/file'], true) ? ['id'] : []);
        foreach ($keys as $key) {
            $id = absint($attrs[$key] ?? 0);
            if ($id <= 0) continue;
            $ids[$id] = true;
            if (get_post_type($id) !== 'attachment' && !isset($fallbacks[$id])) {
                $fallback = ww_block_media_fallback($block, $id);
                if ($fallback) $fallbacks[$id] = $fallback;
            }
        }
        ww_collect_attachment_ids((array) ($block['innerBlocks'] ?? []), $ids, $fallbacks);
    }
}

function ww_attachment(int $id, ?array $fallback = null): ?array {
    $post = get_post($id);
    if (!$post instanceof WP_Post || $post->post_type !== 'attachment') return $fallback;
    $details = function_exists('byline_editorial_media_attachment_details')
        ? byline_editorial_media_attachment_details($id)
        : [];
    return [
        'id' => $id,
        'url' => (string) wp_get_attachment_url($id),
        'filename' => basename((string) get_attached_file($id)),
        'mimeType' => (string) get_post_mime_type($id),
        'alt' => (string) ($details['alt'] ?? get_post_meta($id, '_wp_attachment_image_alt', true)),
        'caption' => (string) $post->post_excerpt,
        'creator' => ww_text($details['creator'] ?? ''),
        'credit' => ww_text($details['creditText'] ?? ''),
        'copyright' => ww_text($details['copyrightNotice'] ?? ''),
        'license' => ww_text($details['licenseUrl'] ?? ''),
        'sourceUrl' => '',
        'capturedAt' => '',
        'artDirection' => function_exists('byline_image_art_direction') ? byline_image_art_direction($id) : null,
        'recoveredFromBlock' => false,
    ];
}

$warnings = [];
$errors = [];
$attachmentIds = [];
$attachmentFallbacks = [];
$users = [];
foreach (get_users() as $user) {
    $photo = absint(get_user_meta($user->ID, '_ww_author_photo_id', true));
    if ($photo > 0) $attachmentIds[$photo] = true;
    $projected = function_exists('byline_project_user_contributor') ? byline_project_user_contributor((int) $user->ID) : null;
    $profile = function_exists('wwh_rest_author_profile') ? wwh_rest_author_profile(['id' => (int) $user->ID]) : [];
    $socials = [];
    foreach ((array) ($profile['socials'] ?? []) as $label => $url) {
        if ($label === 'email' || !is_string($url) || trim($url) === '') continue;
        $socials[] = ['label' => ucfirst((string) $label), 'url' => $url];
    }
    $users[] = [
        'id' => (int) $user->ID,
        'name' => (string) $user->display_name,
        'slug' => (string) $user->user_nicename,
        'pronouns' => ww_text($profile['pronouns'] ?? ''),
        'newsroomRole' => ww_text($profile['role'] ?? (is_array($projected) ? ($projected['role'] ?? '') : '')),
        'accountEmail' => sanitize_email((string) $user->user_email),
        'accountRoles' => array_values(array_map('strval', (array) $user->roles)),
        'shortBio' => ww_text($profile['shortBio'] ?? ''),
        'bio' => is_array($projected) ? ww_text($projected['bio'] ?? '') : ww_text(get_user_meta((int) $user->ID, 'description', true)),
        'portraitId' => $photo ?: null,
        'directoryVisible' => array_key_exists('showInDirectory', $profile) ? (bool) $profile['showInDirectory'] : true,
        'publicEmail' => sanitize_email((string) (($profile['socials']['email'] ?? ''))),
        'socials' => $socials,
    ];
}

$guests = [];
$guestPosts = get_posts(['post_type' => 'byline_guest', 'post_status' => 'any', 'posts_per_page' => -1, 'numberposts' => -1]);
foreach ($guestPosts as $post) {
    $guest = function_exists('byline_get_guest_contributor') ? byline_get_guest_contributor((int) $post->ID) : null;
    if (!is_array($guest)) continue;
    $photo = absint($guest['imageId'] ?? 0);
    if ($photo > 0) $attachmentIds[$photo] = true;
    $links = [];
    foreach ((array) ($guest['links'] ?? []) as $link) {
        if (!is_array($link) || empty($link['url'])) continue;
        $links[] = ['label' => ww_text($link['label'] ?? 'Link') ?: 'Link', 'url' => (string) $link['url']];
    }
    $guests[] = [
        'id' => (int) $post->ID,
        'name' => (string) ($guest['name'] ?? $post->post_title),
        'slug' => (string) ($guest['slug'] ?? $post->post_name),
        'newsroomRole' => ww_text($guest['role'] ?? ''),
        'bio' => ww_text($guest['bio'] ?? ''),
        'portraitId' => $photo ?: null,
        'hasProfilePage' => (bool) ($guest['hasProfilePage'] ?? true),
        'status' => (string) ($guest['status'] ?? 'publish'),
        'socials' => $links,
    ];
}

$categories = array_map(static fn($term) => [
    'id' => (int) $term->term_id, 'name' => (string) $term->name, 'slug' => (string) $term->slug, 'description' => (string) $term->description
], get_terms(['taxonomy' => 'category', 'hide_empty' => false]));
$tags = array_map(static fn($term) => [
    'id' => (int) $term->term_id, 'name' => (string) $term->name, 'slug' => (string) $term->slug, 'description' => (string) $term->description
], get_terms(['taxonomy' => 'post_tag', 'hide_empty' => false]));

$posts = [];
$wpPosts = get_posts([
    'post_type' => 'post', 'post_status' => ['publish', 'draft'], 'posts_per_page' => -1,
    'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC',
]);
foreach ($wpPosts as $post) {
    $parsed = parse_blocks($post->post_content);
    ww_collect_attachment_ids($parsed, $attachmentIds, $attachmentFallbacks);
    $featured = get_post_thumbnail_id($post->ID);
    if ($featured > 0) $attachmentIds[$featured] = true;

    $sequence = 0;
    $blockCorrections = [];
    $bodyWarnings = [];
    $bodyErrors = [];
    $nodes = ww_convert_blocks($parsed, (int) $post->ID, $sequence, $blockCorrections, $bodyWarnings, $bodyErrors);
    array_push($warnings, ...$bodyWarnings);
    array_push($errors, ...$bodyErrors);

    $corrections = [];
    if (function_exists('byline_list_corrections')) {
        foreach (byline_list_corrections((int) $post->ID) as $record) {
            $corrections[] = [
                'legacyId' => (int) ($record['id'] ?? 0) ?: null,
                'type' => ww_text($record['type'] ?? 'correction'),
                'text' => ww_text($record['text'] ?? ''),
                'date' => ww_text($record['recordedAt'] ?? ''),
                'source' => 'record',
            ];
        }
    }
    array_push($corrections, ...$blockCorrections);

    $contributors = function_exists('byline_get_story_contributor_entries')
        ? byline_get_story_contributor_entries((int) $post->ID, true)
        : [['type' => 'user', 'id' => (int) $post->post_author]];

    $editorial = function_exists('byline_get_editorial_story_state')
        ? byline_get_editorial_story_state((int) $post->ID)
        : [];
    $resourceRows = get_post_meta((int) $post->ID, '_byline_story_resources', true);
    $resources = function_exists('byline_story_resources_normalize')
        ? byline_story_resources_normalize(is_array($resourceRows) ? $resourceRows : [])
        : [];
    $resources = array_map(static function (array $resource): array {
        return [
            'label' => ww_text($resource['label'] ?? ''),
            'url' => ww_text($resource['url'] ?? ''),
            'purpose' => ww_text($resource['purpose'] ?? 'other') ?: 'other',
        ];
    }, $resources);

    $posts[] = [
        'id' => (int) $post->ID,
        'title' => (string) $post->post_title,
        'slug' => (string) $post->post_name,
        'status' => (string) $post->post_status,
        'publicPath' => $post->post_status === 'publish' ? (string) wp_make_link_relative(get_permalink($post)) : '',
        // WordPress permalinks and displayed publication dates are anchored to
        // the local wall-clock fields. Keep those explicitly: post_date_gmt can
        // diverge after timezone-setting changes and would shift canonical dates.
        'createdLocal' => str_replace(' ', 'T', (string) $post->post_date),
        'publishedLocal' => str_replace(' ', 'T', (string) $post->post_date),
        'modifiedLocal' => str_replace(' ', 'T', (string) $post->post_modified),
        // Retained only as source-audit facts; Payload publication times below
        // are derived from the local wall clock in the publication timezone.
        'publishedGmt' => str_replace(' ', 'T', (string) $post->post_date_gmt) . 'Z',
        'modifiedGmt' => str_replace(' ', 'T', (string) $post->post_modified_gmt) . 'Z',
        'deck' => trim(wp_strip_all_tags((string) $post->post_excerpt)),
        'featuredMediaId' => $featured ?: null,
        'featuredCaption' => $featured ? (string) wp_get_attachment_caption($featured) : '',
        'categoryIds' => array_values(array_map('intval', wp_get_post_categories($post->ID))),
        'tagIds' => array_values(array_map(static fn($term) => (int) $term->term_id, wp_get_post_tags($post->ID))),
        'contributors' => array_values($contributors),
        'reportingNote' => function_exists('byline_story_reporting_note') ? byline_story_reporting_note((int) $post->ID) : '',
        'format' => function_exists('byline_story_format') ? byline_story_format((int) $post->ID) : 'standard',
        'videoUrl' => function_exists('byline_story_video_url') ? byline_story_video_url((int) $post->ID) : '',
        'presentation' => function_exists('byline_story_presentation_settings') ? (string) (byline_story_presentation_settings((int) $post->ID)['presentation'] ?? 'standard') : 'standard',
        'immersiveAlignment' => function_exists('byline_story_presentation_settings') ? (string) (byline_story_presentation_settings((int) $post->ID)['immersiveAlignment'] ?? 'bottom-left') : 'bottom-left',
        'body' => ['format' => 'byline-v1', 'version' => 1, 'nodes' => $nodes, 'media' => (object) []],
        'corrections' => $corrections,
        'plan' => [
            'workflow' => ww_text($editorial['storedStatus'] ?? 'pitch') ?: 'pitch',
            'editorUserId' => absint($editorial['editorId'] ?? 0) ?: null,
            'deadline' => ww_text($editorial['deadline'] ?? ''),
            'visuals' => ww_text($editorial['visuals'] ?? ''),
            'plannedPublication' => function_exists('byline_get_editorial_planned_publish_at') ? byline_get_editorial_planned_publish_at((int) $post->ID) : '',
            'brief' => ww_text(get_post_meta((int) $post->ID, '_byline_story_brief', true)),
            'resources' => $resources,
        ],
    ];
}

ksort($attachmentIds);
$attachments = [];
foreach (array_keys($attachmentIds) as $id) {
    $attachment = ww_attachment((int) $id, $attachmentFallbacks[$id] ?? null);
    if ($attachment) {
        $attachments[] = $attachment;
        if (!empty($attachment['recoveredFromBlock'])) {
            $warnings[] = !empty($attachment['inlineDataBase64'])
                ? "Attachment {$id} is missing from the WordPress Media Library; recovered from the WordPress uploads filesystem."
                : "Attachment {$id} is missing from the WordPress Media Library; only Gutenberg URL candidates remain.";
        }
    } else {
        $errors[] = "Attachment {$id} is referenced by migrated content but has no WordPress attachment record or recoverable block URL.";
    }
}

$payload = [
    'schemaVersion' => BYLINE_NATIVE_EXPORT_VERSION,
    'generatedAt' => gmdate('c'),
    'siteUrl' => home_url('/'),
    'users' => $users,
    'guests' => $guests,
    'categories' => $categories,
    'tags' => $tags,
    'attachments' => $attachments,
    'posts' => $posts,
    'warnings' => array_values(array_unique($warnings)),
    'errors' => array_values(array_unique($errors)),
];

echo wp_json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
