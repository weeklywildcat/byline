<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_PUBLICATION_OPTION = 'byline_publication_config_v1';
const BYLINE_PUBLICATION_REVISION_OPTION = 'byline_publication_revision';

function byline_publication_asset(string $url, string $alt, ?int $width = null, ?int $height = null): array
{
    return [
        'url' => $url,
        'alt' => $alt,
        'width' => $width,
        'height' => $height,
    ];
}

function byline_publication_theme_ids(): array
{
    $themes = ['byline-editorial', 'byline-magazine', 'byline-modern', 'weekly-wildcat'];
    if (function_exists('apply_filters')) {
        $filtered = apply_filters('byline_theme_ids', $themes);
        if (is_array($filtered)) {
            $themes = array_values(array_unique(array_filter($filtered, static fn($theme): bool =>
                is_string($theme) && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $theme) === 1
            )));
        }
    }
    return $themes;
}

function byline_is_legacy_weekly_wildcat_installation(): bool
{
    $host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
    return $host === 'weeklywildcat.com' || byline_string_ends_with($host, '.weeklywildcat.com');
}

function byline_generic_publication_config(): array
{
    $locale = str_replace('_', '-', (string) get_locale());
    $timezone = wp_timezone_string();
    if ($timezone === '') {
        $timezone = wp_timezone()->getName();
    }

    $name = trim((string) get_bloginfo('name')) ?: 'My Publication';
    $description = trim((string) get_bloginfo('description')) ?: 'Independent community journalism.';
    $cms_url = untrailingslashit(home_url('/'));

    return [
        'schemaVersion' => BYLINE_PUBLICATION_SCHEMA_VERSION,
        'identity' => [
            'name' => $name,
            'shortName' => $name,
            'description' => $description,
            'organizationName' => '',
            'tagline' => $description,
        ],
        'location' => [
            'display' => '', 'city' => '', 'region' => '', 'country' => '', 'address' => '',
        ],
        'locale' => $locale,
        'timezone' => $timezone,
        'urls' => [
            'publicSite' => $cms_url,
            'cms' => $cms_url,
            'contact' => '/contact/',
        ],
        'branding' => [
            'masthead' => byline_publication_asset('', $name),
            'logo' => byline_publication_asset('', $name),
            'organizationLogo' => byline_publication_asset('', ''),
            'icons' => [],
            'defaultSocialImage' => byline_publication_asset('', $name),
        ],
        'appearance' => [
            'theme' => 'byline-modern',
            'tokenOverrides' => [],
        ],
        'sections' => [],
        'navigation' => [],
        'social' => [],
        'features' => [
            'sports' => false, 'events' => false, 'polls' => false, 'newsletter' => false, 'discord' => false,
        ],
        'licensing' => [
            'copyrightNotice' => '© ' . $name,
            'imageLicenseUrl' => '',
            'acquireLicensePage' => '',
        ],
        'seo' => [
            'defaultTitle' => $name,
            'defaultDescription' => $description,
            'organizationType' => 'NewsMediaOrganization',
        ],
    ];
}

function byline_weekly_wildcat_publication_config(): array
{
    $config = byline_generic_publication_config();
    $config['identity'] = [
        'name' => 'Weekly Wildcat', 'shortName' => 'Weekly Wildcat',
        'description' => 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
        'organizationName' => 'Ninety Six High School',
        'tagline' => "Ninety Six High School's Official Student Newspaper",
    ];
    $config['location'] = [
        'display' => 'Ninety Six, S.C.', 'city' => 'Ninety Six', 'region' => 'South Carolina',
        'country' => 'US', 'address' => '640 South Cambridge Street, Ninety Six, SC',
    ];
    $config['urls']['publicSite'] = 'https://weeklywildcat.com';
    $config['branding'] = [
        'masthead' => byline_publication_asset('/brand/weekly-wildcat-wide-logo.svg', 'Weekly Wildcat'),
        'logo' => byline_publication_asset('/brand/weekly-wildcat-logo.svg', 'Weekly Wildcat'),
        'organizationLogo' => byline_publication_asset('/organization-logo.png', 'Ninety Six High School', 1024, 1024),
        'icons' => [
            byline_publication_asset('/favicon-32.png', '', 32, 32),
            byline_publication_asset('/icon-192.png', '', 192, 192),
            byline_publication_asset('/icon-512.png', '', 512, 512),
            byline_publication_asset('/apple-touch-icon.png', '', 180, 180),
        ],
        'defaultSocialImage' => byline_publication_asset('/media-kit/open-graph-social.png', 'Weekly Wildcat', 1200, 600),
    ];
    $config['appearance']['theme'] = 'weekly-wildcat';
    $config['sections'] = [
        ['name' => 'News', 'slug' => 'news', 'description' => '', 'active' => true],
        ['name' => 'Sports', 'slug' => 'sports', 'description' => '', 'active' => true],
        ['name' => 'Opinion', 'slug' => 'opinion', 'description' => '', 'active' => true],
        ['name' => 'Features', 'slug' => 'features', 'description' => '', 'active' => true],
        ['name' => 'Arts & Culture', 'slug' => 'culture', 'description' => '', 'active' => true],
    ];
    $config['navigation'] = [
            ['label' => 'News', 'url' => '/category/news/', 'locations' => ['header']],
            ['label' => 'Sports', 'url' => '/sports/', 'locations' => ['header'], 'feature' => 'sports'],
            ['label' => 'Opinion', 'url' => '/category/opinion/', 'locations' => ['header']],
            ['label' => 'Features', 'url' => '/category/features/', 'locations' => ['header']],
            ['label' => 'News', 'url' => '/category/news/', 'locations' => ['footer'], 'group' => 'Columns'],
            ['label' => 'Features', 'url' => '/category/features/', 'locations' => ['footer'], 'group' => 'Columns'],
            ['label' => 'Opinion', 'url' => '/category/opinion/', 'locations' => ['footer'], 'group' => 'Columns'],
            ['label' => 'Arts & Culture', 'url' => '/category/culture/', 'locations' => ['footer'], 'group' => 'Columns'],
            ['label' => 'Sports', 'url' => '/sports/', 'locations' => ['footer'], 'group' => 'Columns', 'feature' => 'sports'],
            ['label' => 'Terms & Service', 'url' => '/terms/', 'locations' => ['footer'], 'group' => 'Policies'],
            ['label' => 'Privacy Policy', 'url' => '/privacy/', 'locations' => ['footer'], 'group' => 'Policies'],
            ['label' => 'About us', 'url' => '/about/', 'locations' => ['footer'], 'group' => 'About'],
            ['label' => 'Media Kit', 'url' => '/media-kit/', 'locations' => ['footer'], 'group' => 'About'],
            ['label' => 'Advertise with Us', 'url' => '/advertise/', 'locations' => ['footer'], 'group' => 'About'],
            ['label' => 'Join our team', 'url' => '/join/', 'locations' => ['footer'], 'group' => 'About'],
            ['label' => 'Leadership', 'url' => '/leadership/', 'locations' => ['footer'], 'group' => 'About'],
            ['label' => 'Diversity & Inclusion', 'url' => '/diversity-inclusion/', 'locations' => ['footer'], 'group' => 'About'],
    ];
    $config['social'] = [
            ['service' => 'instagram', 'label' => 'Instagram', 'url' => 'https://www.instagram.com/theweeklywildcat'],
            ['service' => 'tiktok', 'label' => 'TikTok', 'url' => 'https://www.tiktok.com/@weeklywildcat'],
    ];
    $config['features'] = [
            'sports' => true,
            'events' => true,
            'polls' => true,
            'newsletter' => true,
            'discord' => true,
    ];
    $config['licensing'] = [
            'copyrightNotice' => '© Weekly Wildcat',
            'imageLicenseUrl' => '/image-license/',
            'acquireLicensePage' => '/image-license/',
    ];
    $config['seo'] = [
            'defaultTitle' => 'Weekly Wildcat',
            'defaultDescription' => 'Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.',
            'organizationType' => 'Organization',
    ];
    return $config;
}

function byline_default_publication_config(): array
{
    return byline_is_legacy_weekly_wildcat_installation()
        ? byline_weekly_wildcat_publication_config()
        : byline_generic_publication_config();
}

function byline_sanitize_public_url($value, string $fallback = ''): string
{
    if (!is_string($value)) {
        return $fallback;
    }

    $value = trim($value);
    if (preg_match('#^/[A-Za-z0-9._~!$&\'()*+,;=:@%/-]*$#', $value) === 1) {
        return $value;
    }

    $url = esc_url_raw($value, ['http', 'https']);
    return is_string($url) && $url !== '' ? $url : $fallback;
}

function byline_publication_absolute_url(string $url): string
{
    if (preg_match('#^https?://#i', $url) === 1) {
        return $url;
    }
    $public_site = byline_get_publication_config()['urls']['publicSite'];
    return rtrim($public_site, '/') . '/' . ltrim($url, '/');
}

function byline_publication_name(): string
{
    return byline_get_publication_config()['identity']['shortName'];
}

function byline_sanitize_public_text($value, string $fallback, int $maximum_length = 160): string
{
    if (!is_string($value)) {
        return $fallback;
    }

    $value = sanitize_text_field($value);
    if ($value === '') {
        return $fallback;
    }

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum_length) : substr($value, 0, $maximum_length);
}

function byline_sanitize_public_asset($value, array $fallback): array
{
    if (!is_array($value)) {
        return $fallback;
    }

    $dimension = static function ($candidate, $default): ?int {
        $candidate = filter_var($candidate, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 8192]]);
        return $candidate === false ? $default : (int) $candidate;
    };

    return [
        'url' => byline_sanitize_public_url($value['url'] ?? null, $fallback['url']),
        'alt' => byline_sanitize_public_text($value['alt'] ?? null, $fallback['alt'], 200),
        'width' => $dimension($value['width'] ?? null, $fallback['width']),
        'height' => $dimension($value['height'] ?? null, $fallback['height']),
    ];
}

function byline_normalize_publication_config($input): array
{
    $defaults = byline_default_publication_config();
    if (!is_array($input)) {
        return $defaults;
    }

    $identity = is_array($input['identity'] ?? null) ? $input['identity'] : [];
    $location = is_array($input['location'] ?? null) ? $input['location'] : [];
    $urls = is_array($input['urls'] ?? null) ? $input['urls'] : [];
    $branding = is_array($input['branding'] ?? null) ? $input['branding'] : [];
    $appearance = is_array($input['appearance'] ?? null) ? $input['appearance'] : [];
    $licensing = is_array($input['licensing'] ?? null) ? $input['licensing'] : [];
    $seo = is_array($input['seo'] ?? null) ? $input['seo'] : [];

    $normalized = $defaults;
    $normalized['identity'] = [
        'name' => byline_sanitize_public_text($identity['name'] ?? null, $defaults['identity']['name'], 120),
        'shortName' => byline_sanitize_public_text($identity['shortName'] ?? null, $defaults['identity']['shortName'], 50),
        'description' => byline_sanitize_public_text($identity['description'] ?? null, $defaults['identity']['description'], 320),
        'organizationName' => byline_sanitize_public_text($identity['organizationName'] ?? null, $defaults['identity']['organizationName'], 160),
        'tagline' => byline_sanitize_public_text($identity['tagline'] ?? null, $defaults['identity']['tagline'], 200),
    ];
    $normalized['location'] = [
        'display' => byline_sanitize_public_text($location['display'] ?? null, $defaults['location']['display'], 120),
        'city' => byline_sanitize_public_text($location['city'] ?? null, $defaults['location']['city'], 100),
        'region' => byline_sanitize_public_text($location['region'] ?? null, $defaults['location']['region'], 100),
        'country' => strtoupper(byline_sanitize_public_text($location['country'] ?? null, $defaults['location']['country'], 2)),
        'address' => byline_sanitize_public_text($location['address'] ?? null, $defaults['location']['address'], 240),
    ];

    $locale = is_string($input['locale'] ?? null) ? str_replace('_', '-', $input['locale']) : '';
    $normalized['locale'] = preg_match('/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/', $locale) === 1
        ? $locale
        : $defaults['locale'];
    $timezone = is_string($input['timezone'] ?? null) ? trim($input['timezone']) : '';
    $normalized['timezone'] = in_array($timezone, timezone_identifiers_list(), true) ? $timezone : $defaults['timezone'];
    $normalized['urls'] = [
        'publicSite' => rtrim(byline_sanitize_public_url($urls['publicSite'] ?? null, $defaults['urls']['publicSite']), '/'),
        'cms' => rtrim(byline_sanitize_public_url($urls['cms'] ?? null, $defaults['urls']['cms']), '/'),
        'contact' => byline_sanitize_public_url($urls['contact'] ?? null, $defaults['urls']['contact']),
    ];

    foreach (['masthead', 'logo', 'organizationLogo', 'defaultSocialImage'] as $asset_name) {
        $normalized['branding'][$asset_name] = byline_sanitize_public_asset(
            $branding[$asset_name] ?? null,
            $defaults['branding'][$asset_name]
        );
    }
    $normalized['branding']['icons'] = [];
    foreach (array_slice(is_array($branding['icons'] ?? null) ? $branding['icons'] : $defaults['branding']['icons'], 0, 8) as $index => $icon) {
        $fallback = $defaults['branding']['icons'][$index] ?? byline_publication_asset('', '');
        $sanitized = byline_sanitize_public_asset($icon, $fallback);
        if ($sanitized['url'] !== '') {
            $normalized['branding']['icons'][] = $sanitized;
        }
    }

    $theme = is_string($appearance['theme'] ?? null) ? sanitize_key($appearance['theme']) : '';
    $normalized['appearance']['theme'] = in_array($theme, byline_publication_theme_ids(), true)
        ? $theme
        : $defaults['appearance']['theme'];
    $color_tokens = ['background', 'surface', 'text', 'mutedText', 'mutedTextSoft', 'accent', 'accentStrong', 'link', 'border', 'borderStrong'];
    $font_tokens = ['fontDisplay', 'fontHeadline', 'fontBody', 'fontUI', 'fontEditorial'];
    $length_tokens = ['contentWidth', 'articleWidth', 'radiusSmall', 'radiusMedium'];
    $normalized['appearance']['tokenOverrides'] = [];
    foreach (is_array($appearance['tokenOverrides'] ?? null) ? $appearance['tokenOverrides'] : [] as $key => $value) {
        if (!is_string($value)) {
            continue;
        }
        if (in_array($key, $color_tokens, true) && preg_match('/^#[0-9a-f]{6}$/i', $value) === 1) {
            $normalized['appearance']['tokenOverrides'][$key] = $value;
        } elseif (in_array($key, $font_tokens, true) && preg_match('/^[A-Za-z0-9 \'".,_-]{1,200}$/', $value) === 1) {
            $normalized['appearance']['tokenOverrides'][$key] = $value;
        } elseif (in_array($key, $length_tokens, true) && preg_match('/^\d+(?:\.\d+)?(?:px|rem|em|ch|vw|%)$/', $value) === 1) {
            $normalized['appearance']['tokenOverrides'][$key] = $value;
        } elseif ($key === 'density' && in_array($value, ['compact', 'comfortable', 'spacious'], true)) {
            $normalized['appearance']['tokenOverrides'][$key] = $value;
        }
    }

    $normalized['sections'] = [];
    foreach (array_slice(is_array($input['sections'] ?? null) ? $input['sections'] : $defaults['sections'], 0, 30) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = byline_sanitize_public_text($item['name'] ?? null, '', 80);
        $slug = is_string($item['slug'] ?? null) ? sanitize_title($item['slug']) : '';
        if ($name === '' || $slug === '') {
            continue;
        }
        $normalized['sections'][] = [
            'name' => $name,
            'slug' => $slug,
            'description' => byline_sanitize_public_text($item['description'] ?? null, '', 240),
            'active' => !array_key_exists('active', $item) || filter_var($item['active'], FILTER_VALIDATE_BOOLEAN),
        ];
    }

    $normalized['navigation'] = [];
    foreach (array_slice(is_array($input['navigation'] ?? null) ? $input['navigation'] : $defaults['navigation'], 0, 30) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $label = byline_sanitize_public_text($item['label'] ?? null, '', 80);
        $url = byline_sanitize_public_url($item['url'] ?? null);
        if ($label !== '' && $url !== '') {
            $locations = [];
            foreach (is_array($item['locations'] ?? null) ? $item['locations'] : [] as $location) {
                if (in_array($location, ['header', 'footer'], true) && !in_array($location, $locations, true)) {
                    $locations[] = $location;
                }
            }
            $group = byline_sanitize_public_text($item['group'] ?? null, '', 80);
            $feature = is_string($item['feature'] ?? null) ? sanitize_key($item['feature']) : '';
            $navigation_item = [
                'label' => $label,
                'url' => $url,
                'locations' => $locations,
            ];
            if ($group !== '') {
                $navigation_item['group'] = $group;
            }
            if ($feature !== '') {
                $navigation_item['feature'] = $feature;
            }
            $normalized['navigation'][] = $navigation_item;
        }
    }

    $normalized['social'] = [];
    foreach (array_slice(is_array($input['social'] ?? null) ? $input['social'] : $defaults['social'], 0, 20) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $service = is_string($item['service'] ?? null) ? sanitize_key($item['service']) : '';
        $label = byline_sanitize_public_text($item['label'] ?? null, '', 80);
        $url = byline_sanitize_public_url($item['url'] ?? null);
        if ($service !== '' && $label !== '' && $url !== '') {
            $normalized['social'][] = ['service' => $service, 'label' => $label, 'url' => $url];
        }
    }

    foreach (array_keys($defaults['features']) as $feature) {
        if (array_key_exists($feature, is_array($input['features'] ?? null) ? $input['features'] : [])) {
            $normalized['features'][$feature] = filter_var($input['features'][$feature], FILTER_VALIDATE_BOOLEAN);
        }
    }
    $normalized['licensing'] = [
        'copyrightNotice' => byline_sanitize_public_text($licensing['copyrightNotice'] ?? null, $defaults['licensing']['copyrightNotice'], 160),
        'imageLicenseUrl' => byline_sanitize_public_url($licensing['imageLicenseUrl'] ?? null, $defaults['licensing']['imageLicenseUrl']),
        'acquireLicensePage' => byline_sanitize_public_url($licensing['acquireLicensePage'] ?? null, $defaults['licensing']['acquireLicensePage']),
    ];
    $organization_type = $seo['organizationType'] ?? '';
    $normalized['seo'] = [
        'defaultTitle' => byline_sanitize_public_text($seo['defaultTitle'] ?? null, $normalized['identity']['name'], 120),
        'defaultDescription' => byline_sanitize_public_text($seo['defaultDescription'] ?? null, $normalized['identity']['description'], 320),
        'organizationType' => in_array($organization_type, ['Organization', 'NewsMediaOrganization'], true)
            ? $organization_type
            : $defaults['seo']['organizationType'],
    ];

    return $normalized;
}

function byline_get_publication_config(): array
{
    return byline_normalize_publication_config(get_option(BYLINE_PUBLICATION_OPTION, null));
}

function byline_publication_response(): array
{
    $response = byline_get_publication_config();
    $response['revision'] = max(0, (int) get_option(BYLINE_PUBLICATION_REVISION_OPTION, 0));
    return $response;
}

function byline_seed_publication_config(): void
{
    if (get_option(BYLINE_PUBLICATION_OPTION, null) === null) {
        add_option(BYLINE_PUBLICATION_OPTION, byline_default_publication_config(), '', false);
    }

    // Older installations may have the configuration but not its revision
    // marker. Adding the missing marker is safe; an existing revision is never
    // reset during an upgrade.
    if (get_option(BYLINE_PUBLICATION_REVISION_OPTION, null) === null) {
        add_option(BYLINE_PUBLICATION_REVISION_OPTION, 1, '', false);
    }
}

function byline_publication_validation_error(string $field, string $message)
{
    return new WP_Error(
        'byline_invalid_publication_config',
        $message,
        ['status' => 400, 'field' => $field]
    );
}

function byline_publication_is_http_url($value): bool
{
    if (!is_string($value) || trim($value) === '') {
        return false;
    }

    $url = esc_url_raw(trim($value), ['http', 'https']);
    if (!is_string($url) || $url === '' || !function_exists('wp_parse_url')) {
        return false;
    }

    return in_array(strtolower((string) wp_parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true)
        && (string) wp_parse_url($url, PHP_URL_HOST) !== '';
}

/**
 * Validate the parts of the publication document that can otherwise fail much
 * later in a static build. Normalization remains the final safety boundary,
 * but editors now receive a field-oriented REST error instead of a silently
 * substituted default.
 */
function byline_validate_publication_config($input)
{
    if (!is_array($input)) {
        return byline_publication_validation_error('publication', __('Publication configuration must be an object.', 'weekly-wildcat-headless'));
    }

    if ((int) ($input['schemaVersion'] ?? 0) !== BYLINE_PUBLICATION_SCHEMA_VERSION) {
        return byline_publication_validation_error('schemaVersion', __('Publication configuration must use the supported Byline schema version.', 'weekly-wildcat-headless'));
    }

    $identity = is_array($input['identity'] ?? null) ? $input['identity'] : [];
    foreach (['name' => 'Publication name', 'shortName' => 'Short name', 'description' => 'Description'] as $key => $label) {
        if (!is_string($identity[$key] ?? null) || trim($identity[$key]) === '') {
            return byline_publication_validation_error('identity.' . $key, sprintf(__('%s is required.', 'weekly-wildcat-headless'), $label));
        }
        $maximum = $key === 'description' ? 500 : ($key === 'name' ? 120 : 80);
        if (strlen($identity[$key]) > $maximum) {
            return byline_publication_validation_error('identity.' . $key, sprintf(__('%s must be %d characters or fewer.', 'weekly-wildcat-headless'), $label, $maximum));
        }
    }

    $urls = is_array($input['urls'] ?? null) ? $input['urls'] : [];
    foreach (['publicSite' => 'Public URL', 'cms' => 'CMS URL'] as $key => $label) {
        if (!byline_publication_is_http_url($urls[$key] ?? null)) {
            return byline_publication_validation_error('urls.' . $key, sprintf(__('%s must be a valid http or https URL.', 'weekly-wildcat-headless'), $label));
        }
    }

    $appearance = is_array($input['appearance'] ?? null) ? $input['appearance'] : [];
    $theme = is_string($appearance['theme'] ?? null) ? sanitize_key($appearance['theme']) : '';
    if (!in_array($theme, byline_publication_theme_ids(), true)) {
        return byline_publication_validation_error('appearance.theme', __('Choose one of the installed Byline themes.', 'weekly-wildcat-headless'));
    }

    $token_overrides = is_array($appearance['tokenOverrides'] ?? null) ? $appearance['tokenOverrides'] : [];
    foreach (['accent', 'link', 'background', 'surface', 'text'] as $token) {
        if (array_key_exists($token, $token_overrides)
            && $token_overrides[$token] !== ''
            && (!is_string($token_overrides[$token]) || preg_match('/^#[0-9a-f]{6}$/i', $token_overrides[$token]) !== 1)) {
            return byline_publication_validation_error('appearance.tokenOverrides.' . $token, __('Color overrides must use six-digit hex values such as #008b95.', 'weekly-wildcat-headless'));
        }
    }

    $navigation = is_array($input['navigation'] ?? null) ? $input['navigation'] : [];
    $navigation_keys = [];
    foreach ($navigation as $index => $item) {
        if (!is_array($item)) {
            return byline_publication_validation_error('navigation.' . $index, __('Each navigation item must be an object.', 'weekly-wildcat-headless'));
        }
        if (!is_string($item['label'] ?? null) || trim($item['label']) === '') {
            return byline_publication_validation_error('navigation.' . $index . '.label', __('Navigation labels cannot be empty.', 'weekly-wildcat-headless'));
        }
        if (strlen($item['label']) > 80) {
            return byline_publication_validation_error('navigation.' . $index . '.label', __('Navigation labels must be 80 characters or fewer.', 'weekly-wildcat-headless'));
        }
        if (byline_sanitize_public_url($item['url'] ?? null) === '') {
            return byline_publication_validation_error('navigation.' . $index . '.url', __('Navigation URLs must be a valid site path or http(s) URL.', 'weekly-wildcat-headless'));
        }
        $locations = is_array($item['locations'] ?? null) ? array_values(array_intersect($item['locations'], ['header', 'footer'])) : [];
        if ($locations === []) {
            return byline_publication_validation_error('navigation.' . $index . '.locations', __('Choose a header or footer placement for each navigation item.', 'weekly-wildcat-headless'));
        }
        $navigation_key = strtolower(trim((string) $item['label'])) . '|' . byline_sanitize_public_url($item['url']) . '|' . implode(',', $locations);
        if (in_array($navigation_key, $navigation_keys, true)) {
            return byline_publication_validation_error('navigation.' . $index, __('Navigation items must not be duplicated.', 'weekly-wildcat-headless'));
        }
        $navigation_keys[] = $navigation_key;
    }

    $sections = is_array($input['sections'] ?? null) ? $input['sections'] : [];
    $section_slugs = [];
    foreach ($sections as $index => $section) {
        if (!is_array($section)) {
            return byline_publication_validation_error('sections.' . $index, __('Each section must be an object.', 'weekly-wildcat-headless'));
        }
        if (!is_string($section['name'] ?? null) || trim($section['name']) === '') {
            return byline_publication_validation_error('sections.' . $index . '.name', __('Section names cannot be empty.', 'weekly-wildcat-headless'));
        }
        if (strlen($section['name']) > 80) {
            return byline_publication_validation_error('sections.' . $index . '.name', __('Section names must be 80 characters or fewer.', 'weekly-wildcat-headless'));
        }
        if (!is_string($section['slug'] ?? null) || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $section['slug']) !== 1) {
            return byline_publication_validation_error('sections.' . $index . '.slug', __('Section slugs must use lowercase letters, numbers, and hyphens.', 'weekly-wildcat-headless'));
        }
        if (in_array($section['slug'], $section_slugs, true)) {
            return byline_publication_validation_error('sections.' . $index . '.slug', __('Section slugs must be unique.', 'weekly-wildcat-headless'));
        }
        $section_slugs[] = $section['slug'];
    }

    $social = is_array($input['social'] ?? null) ? $input['social'] : [];
    foreach ($social as $index => $item) {
        if (!is_array($item)
            || !is_string($item['service'] ?? null)
            || preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', sanitize_key($item['service'])) !== 1) {
            return byline_publication_validation_error('social.' . $index . '.service', __('Choose a supported social service name.', 'weekly-wildcat-headless'));
        }
        if (!is_string($item['label'] ?? null) || trim($item['label']) === '') {
            return byline_publication_validation_error('social.' . $index . '.label', __('Social link labels cannot be empty.', 'weekly-wildcat-headless'));
        }
        if (strlen($item['label']) > 80) {
            return byline_publication_validation_error('social.' . $index . '.label', __('Social link labels must be 80 characters or fewer.', 'weekly-wildcat-headless'));
        }
        if (!byline_publication_is_http_url($item['url'] ?? null)) {
            return byline_publication_validation_error('social.' . $index . '.url', __('Social links must be valid http or https URLs.', 'weekly-wildcat-headless'));
        }
    }

    return true;
}

function byline_update_publication_config(WP_REST_Request $request)
{
    $input = $request->get_json_params();
    $validation = byline_validate_publication_config($input);
    if ($validation instanceof WP_Error) {
        return $validation;
    }

    $normalized = byline_normalize_publication_config($input);
    update_option(BYLINE_PUBLICATION_OPTION, $normalized, false);
    $revision = max(0, (int) get_option(BYLINE_PUBLICATION_REVISION_OPTION, 0)) + 1;
    update_option(BYLINE_PUBLICATION_REVISION_OPTION, $revision, false);
    // The publication revision is already the value emitted by the static
    // manifest. Record that exact revision on the durable deployment request;
    // the scheduler must not bump it a second time.
    if (function_exists('byline_schedule_deployment')) {
        byline_schedule_deployment('publication', true, $revision);
    }

    return rest_ensure_response(byline_publication_response());
}

function byline_register_publication_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/publication', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => static fn() => rest_ensure_response(byline_publication_response()),
            'permission_callback' => '__return_true',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_update_publication_config',
            'permission_callback' => static fn() => current_user_can(BYLINE_MANAGE_CAPABILITY),
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_publication_routes');
