<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_DESIGN_SCHEMA_VERSION = 1;

$design_features = [
    'sports' => true,
    'events' => true,
    'polls' => true,
    'newsletter' => true,
];

class WP_Error
{
    public string $code;
    public string $message;
    public array $data;

    public function __construct(
        string $code,
        string $message,
        array $data = []
    ) {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }
}

function __(string $message, string $domain = ''): string
{
    return $message;
}

function wp_json_encode($value)
{
    return json_encode($value);
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

function apply_filters(string $hook, $value, ...$args)
{
    if ($hook === 'byline_design_block_ids') {
        return [...$value, 'schoolpress/weather-card', 'Unsafe Block!'];
    }
    if ($hook === 'byline_design_templates') {
        return [...$value, 'landing-page', 'Unsafe Template!'];
    }
    return $value;
}

function byline_get_publication_config(): array
{
    global $design_features;
    return [
        'appearance' => ['theme' => 'weekly-wildcat'],
        'features' => $design_features,
    ];
}

require __DIR__ . '/../includes/design/schema.php';

if (byline_design_conflict(3, 3) !== null) {
    fwrite(STDERR, "Matching design revisions were incorrectly treated as a conflict.\n");
    exit(1);
}
$conflict = byline_design_conflict(3, 4);
if (!$conflict instanceof WP_Error || $conflict->code !== 'byline_design_conflict' || $conflict->data['status'] !== 409) {
    fwrite(STDERR, "Concurrent design publishing was not rejected with a conflict.\n");
    exit(1);
}

$document = byline_default_design_document('home');
if (byline_validate_design_document($document, 'home') !== true) {
    fwrite(STDERR, "The compatible default homepage design was rejected.\n");
    exit(1);
}

if (!in_array('schoolpress/weather-card', byline_design_block_ids(), true)
    || in_array('Unsafe Block!', byline_design_block_ids(), true)
    || !byline_is_design_template('landing-page')) {
    fwrite(STDERR, "Trusted Level 3 extension allowlists were not applied safely.\n");
    exit(1);
}

$extension_document = $document;
$extension_document['layout']['content'] = [['type' => 'schoolpress/weather-card', 'props' => ['id' => 'weather-1']]];
if (byline_validate_design_document($extension_document, 'home') !== true) {
    fwrite(STDERR, "A namespaced extension block was rejected.\n");
    exit(1);
}

$unsafe = $document;
$unsafe['layout']['content'][0]['props']['rawHtml'] = '<script>alert(1)</script>';
$unsafe_result = byline_validate_design_document($unsafe, 'home');
if (!$unsafe_result instanceof WP_Error || $unsafe_result->code !== 'byline_unsafe_design_props') {
    fwrite(STDERR, "Unsafe design properties were not rejected.\n");
    exit(1);
}

$unknown = $document;
$unknown['layout']['content'][0]['type'] = 'raw-html';
$unknown_result = byline_validate_design_document($unknown, 'home');
if (!$unknown_result instanceof WP_Error || $unknown_result->code !== 'byline_unknown_design_block') {
    fwrite(STDERR, "Unknown design blocks were not rejected.\n");
    exit(1);
}

$unbounded = $document;
$unbounded['layout']['content'][0]['props']['query'] = ['type' => 'latest', 'limit' => 5000];
$unbounded_result = byline_validate_design_document($unbounded, 'home');
if (!$unbounded_result instanceof WP_Error || $unbounded_result->code !== 'byline_invalid_story_query') {
    fwrite(STDERR, "Unbounded StoryQuery values were not rejected.\n");
    exit(1);
}

$design_features['sports'] = false;
$disabled = $document;
$disabled['layout']['content'] = [[
    'type' => 'sports-scores',
    'props' => ['id' => 'scores-1'],
]];
$disabled_result = byline_validate_design_document($disabled, 'home');
if (!$disabled_result instanceof WP_Error || $disabled_result->code !== 'byline_disabled_design_module') {
    fwrite(STDERR, "Blocks for disabled modules were not rejected.\n");
    exit(1);
}

$oversized = $document;
$oversized['layout']['content'] = array_fill(0, BYLINE_DESIGN_MAX_BLOCKS + 1, [
    'type' => 'divider',
    'props' => ['id' => 'divider'],
]);
$oversized_result = byline_validate_design_document($oversized, 'home');
if (!$oversized_result instanceof WP_Error || $oversized_result->code !== 'byline_invalid_design_layout') {
    fwrite(STDERR, "Oversized block lists were not rejected.\n");
    exit(1);
}

// --- schema 2 ---------------------------------------------------------------
// Storage accepts schema 2 alongside schema 1 while the homepage is migrated
// package by package. These pin the v2 validation rules.

$v2 = [
    'schemaVersion' => 2,
    'template' => 'home',
    'theme' => 'weekly-wildcat',
    'packages' => [[
        'id' => 'home-lead',
        'type' => 'lead-package',
        'props' => [
            'lead' => ['source' => ['type' => 'sticky']],
            'latest' => ['source' => ['type' => 'latest'], 'limit' => 4, 'heading' => 'The Latest', 'showBylines' => true],
            'utility' => ['poll' => true, 'calendar' => true, 'calendarLimit' => 3],
            'presentation' => ['showDeck' => true, 'opinionTreatment' => 'auto'],
        ],
    ]],
];

if (byline_validate_design_document($v2, 'home') !== true) {
    fwrite(STDERR, "A valid schema 2 document was rejected.\n");
    exit(1);
}

$v2_unknown = $v2;
$v2_unknown['packages'][0]['type'] = 'mystery-package';
$v2_unknown_result = byline_validate_design_document($v2_unknown, 'home');
if (!$v2_unknown_result instanceof WP_Error || $v2_unknown_result->code !== 'byline_unknown_design_block') {
    fwrite(STDERR, "An unknown schema 2 package was not rejected.\n");
    exit(1);
}

$v2_duplicate = $v2;
$v2_duplicate['packages'][] = $v2['packages'][0];
$v2_duplicate_result = byline_validate_design_document($v2_duplicate, 'home');
if (!$v2_duplicate_result instanceof WP_Error || $v2_duplicate_result->code !== 'byline_invalid_design_package') {
    fwrite(STDERR, "A repeated schema 2 package id was not rejected.\n");
    exit(1);
}

$v2_bad_source = $v2;
$v2_bad_source['packages'][0]['props']['lead']['source'] = ['type' => 'category'];
$v2_bad_source_result = byline_validate_design_document($v2_bad_source, 'home');
if (!$v2_bad_source_result instanceof WP_Error || $v2_bad_source_result->code !== 'byline_invalid_story_query') {
    fwrite(STDERR, "An invalid schema 2 story source was not rejected.\n");
    exit(1);
}

// A schema 2 source must not smuggle a v1 unbounded limit back in.
$v2_manual = $v2;
$v2_manual['packages'][0]['props']['lead']['source'] = ['type' => 'manual', 'storyIds' => array_fill(0, 51, 1)];
$v2_manual_result = byline_validate_design_document($v2_manual, 'home');
if (!$v2_manual_result instanceof WP_Error || $v2_manual_result->code !== 'byline_invalid_story_query') {
    fwrite(STDERR, "An oversized manual schema 2 selection was not rejected.\n");
    exit(1);
}

$v2_unsupported = $v2;
$v2_unsupported['schemaVersion'] = 3;
$v2_unsupported_result = byline_validate_design_document($v2_unsupported, 'home');
if (!$v2_unsupported_result instanceof WP_Error || $v2_unsupported_result->code !== 'byline_invalid_design_identity') {
    fwrite(STDERR, "An unsupported schema version was not rejected.\n");
    exit(1);
}

// Preserved schema 1 blocks must round-trip through storage, and must be held to
// the same safety rules as package props.
$v2_legacy = $v2;
$v2_legacy['legacy'] = [
    'schemaVersion' => 1,
    'editor' => ['engine' => 'puck', 'version' => '0.23.0'],
    'unconvertedBlocks' => [[
        'type' => 'sports-scores',
        'props' => ['id' => 'sports-scores-2', 'title' => 'Scoreboard', 'teamKey' => 'football-varsity'],
    ]],
];
if (byline_validate_design_document($v2_legacy, 'home') !== true) {
    fwrite(STDERR, "A schema 2 document carrying preserved legacy blocks was rejected.\n");
    exit(1);
}

$v2_bad_legacy = $v2_legacy;
$v2_bad_legacy['legacy']['unconvertedBlocks'] = [['type' => 'sports-scores']];
$v2_bad_legacy_result = byline_validate_design_document($v2_bad_legacy, 'home');
if (!$v2_bad_legacy_result instanceof WP_Error || $v2_bad_legacy_result->code !== 'byline_unsafe_design_props') {
    fwrite(STDERR, "Malformed legacy data was not rejected.\n");
    exit(1);
}

// --- sports package ---------------------------------------------------------

$sports_package = [
    'id' => 'home-sports',
    'type' => 'sports-package',
    'props' => [
        'heading' => 'Sports',
        'stories' => ['source' => ['type' => 'section', 'slug' => 'sports'], 'limit' => 3],
        'athleteSpotlight' => ['enabled' => true, 'source' => ['type' => 'athlete-spotlight']],
        'scores' => ['enabled' => true, 'limit' => 2],
        'upcoming' => ['enabled' => true, 'limit' => 3],
        'presentation' => ['showDeck' => true, 'showBylines' => true],
    ],
];

$v2_sports = $v2;
$v2_sports['packages'][] = $sports_package;
if (byline_validate_design_document($v2_sports, 'home') !== true) {
    fwrite(STDERR, "A valid schema 2 sports package was rejected.\n");
    exit(1);
}

// The sports package's own source slots are validated, not just the lead's.
$v2_sports_bad = $v2_sports;
$v2_sports_bad['packages'][1]['props']['stories']['source'] = ['type' => 'section', 'slug' => 'Sports Desk'];
$v2_sports_bad_result = byline_validate_design_document($v2_sports_bad, 'home');
if (!$v2_sports_bad_result instanceof WP_Error || $v2_sports_bad_result->code !== 'byline_invalid_story_query') {
    fwrite(STDERR, "An invalid sports section source was not rejected.\n");
    exit(1);
}

$v2_spotlight_bad = $v2_sports;
$v2_spotlight_bad['packages'][1]['props']['athleteSpotlight']['source'] = ['type' => 'manual', 'storyIds' => ['x']];
$v2_spotlight_bad_result = byline_validate_design_document($v2_spotlight_bad, 'home');
if (!$v2_spotlight_bad_result instanceof WP_Error || $v2_spotlight_bad_result->code !== 'byline_invalid_story_query') {
    fwrite(STDERR, "An invalid athlete spotlight source was not rejected.\n");
    exit(1);
}

// A v1 sports block id is not a v2 package type: the two namespaces must not
// blur while both schemas are readable.
$v2_v1_type = $v2_sports;
$v2_v1_type['packages'][1]['type'] = 'sports-scores';
$v2_v1_type_result = byline_validate_design_document($v2_v1_type, 'home');
if (!$v2_v1_type_result instanceof WP_Error || $v2_v1_type_result->code !== 'byline_unknown_design_block') {
    fwrite(STDERR, "A v1 sports block id was accepted as a v2 package type.\n");
    exit(1);
}

// A design may carry both extracted packages, in document order.
$v2_ordered = $v2_sports;
if (byline_validate_design_document($v2_ordered, 'home') !== true
    || $v2_ordered['packages'][0]['type'] !== 'lead-package'
    || $v2_ordered['packages'][1]['type'] !== 'sports-package') {
    fwrite(STDERR, "The two-package home document did not validate in order.\n");
    exit(1);
}

echo "Byline design schema regression passed.\n";
