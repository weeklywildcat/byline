<?php

$puc_errors = [];

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        private $code;

        public function __construct($code, $message = '')
        {
            $this->code = $code;
        }

        public function get_error_code()
        {
            return $this->code;
        }
    }
}

function apply_filters($hook, $value)
{
    return $value;
}

function do_action($hook, ...$args)
{
    global $puc_errors;
    if ($hook === 'puc_api_error' && isset($args[0]) && $args[0] instanceof WP_Error) {
        $puc_errors[] = $args[0]->get_error_code();
    }
}

function __($text, $domain = null)
{
    return $text;
}

// The WordPress.org readme parser is real code from the vendored updater. These
// are the WordPress primitives it needs to run outside a WordPress request.
function esc_html($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES);
}

function wp_kses($text, $allowed_html = [], $allowed_protocols = [])
{
    return (string) $text;
}

function wp_strip_all_tags($text, $remove_breaks = false)
{
    return strip_tags((string) $text);
}

function balanceTags($text, $force = false)
{
    return (string) $text;
}

require_once __DIR__ . '/../plugin-update-checker/plugin-update-checker.php';

$canonical_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($canonical_source)) {
    fwrite(STDERR, "Could not read the canonical plugin source.\n");
    exit(1);
}

if (preg_match('/^\s*\* Version:\s*([^\s]+)\s*$/m', $canonical_source, $byline_version_match) !== 1) {
    fwrite(STDERR, "Could not read the plugin version from the canonical plugin header.\n");
    exit(1);
}

// The version currently shipping, and the tag a release of it publishes.
define('BYLINE_TRANSITION_VERSION', $byline_version_match[1]);
define('BYLINE_TRANSITION_TAG', 'v' . BYLINE_TRANSITION_VERSION);
define('BYLINE_TRANSITION_DOWNLOAD_URL', 'https://github.com/weeklywildcat/byline/releases/download/' . BYLINE_TRANSITION_TAG . '/weekly-wildcat-headless.zip');

final class BylineTransitionPackage
{
    public function getAbsoluteDirectoryPath()
    {
        return dirname(__DIR__);
    }

    public function getPluginHeader()
    {
        return ['Name' => 'Byline', 'Version' => '0.2.3'];
    }

    public function getFileHeader($source)
    {
        preg_match('/^\s*\* Version:\s*([^\s]+)\s*$/m', $source, $matches);
        return ['Name' => 'Byline', 'Version' => isset($matches[1]) ? $matches[1] : null];
    }

    public function fileExists($path)
    {
        // The installed plugin ships readme.txt, which is what makes PUC look
        // for the remote one and surface a changelog in the update screen.
        return $path === 'readme.txt';
    }
}

final class BylineTransitionApi
{
    public $requestedPath;
    public $requestedReadmePath;
    public $requestedRef;
    private $remoteSource;

    public function __construct($remote_source)
    {
        $this->remoteSource = $remote_source;
    }

    public function setLocalDirectory($directory)
    {
    }

    // Mirrors the real VCS API: fetch readme.txt from the repository root at the
    // release ref and run it through the same WordPress.org readme parser.
    public function getRemoteReadme($ref = 'master')
    {
        $contents = $this->getRemoteFile($this->getLocalReadmeName(), $ref);
        if (empty($contents)) {
            return [];
        }

        $parser = new PucReadmeParser();
        return $parser->parse_readme_contents($contents);
    }

    public function chooseReference($branch)
    {
        return (object) [
            'name' => BYLINE_TRANSITION_TAG,
            'version' => BYLINE_TRANSITION_VERSION,
            'updated' => '2026-08-26T00:00:00Z',
            'downloadUrl' => BYLINE_TRANSITION_DOWNLOAD_URL,
        ];
    }

    public function getRemoteFile($path, $ref = 'master')
    {
        $this->requestedRef = $ref;

        // PUC resolves every remote file from the repository root, which is why
        // the canonical entrypoint and readme.txt are exposed there as symlinks.
        if ($path === 'readme.txt') {
            $this->requestedReadmePath = $path;
            if ($this->remoteSource === null) {
                do_action('puc_api_error', new WP_Error('puc-github-http-error', 'GitHub API returned 404.'));
                return null;
            }
            return file_get_contents(__DIR__ . '/../readme.txt');
        }

        $this->requestedPath = $path;
        if ($this->remoteSource === null) {
            do_action('puc_api_error', new WP_Error('puc-github-http-error', 'GitHub API returned 404.'));
        }
        return $this->remoteSource;
    }

    public function getLocalReadmeName()
    {
        return 'readme.txt';
    }

    public function getRemoteChangelog($ref, $local_directory)
    {
        return null;
    }

    public function getLatestCommitTime($ref)
    {
        return null;
    }
}

final class BylineTransitionChecker extends \YahnisElsts\PluginUpdateChecker\v5p7\Vcs\PluginUpdateChecker
{
    public function __construct($api)
    {
        $this->api = $api;
        $this->package = new BylineTransitionPackage();
        $this->pluginFile = 'weekly-wildcat-headless/weekly-wildcat-headless.php';
        $this->slug = 'weekly-wildcat-headless';
        $this->branch = 'master';
    }

    protected function setIconsFromLocalAssets($plugin_info)
    {
    }

    protected function setBannersFromLocalAssets($plugin_info)
    {
    }
}

function verify_transition($remote_source, $expected_error)
{
    global $puc_errors;
    $puc_errors = [];
    $api = new BylineTransitionApi($remote_source);
    $info = (new BylineTransitionChecker($api))->requestInfo();

    if ($api->requestedPath !== 'weekly-wildcat-headless.php'
        || $api->requestedRef !== BYLINE_TRANSITION_TAG
        || $info === null
        || $info->version !== BYLINE_TRANSITION_VERSION
        || $info->download_url !== BYLINE_TRANSITION_DOWNLOAD_URL
        || $info->filename !== 'weekly-wildcat-headless/weekly-wildcat-headless.php'
        || in_array('puc-no-plugin-version', $puc_errors, true)
        || ($expected_error !== null && !in_array($expected_error, $puc_errors, true))
        || ($expected_error === null && count($puc_errors) !== 0)) {
        fwrite(STDERR, 'The installed 0.2.3 to canonical ' . BYLINE_TRANSITION_VERSION . " updater transition failed.\n");
        exit(1);
    }
}

verify_transition($canonical_source, null);
verify_transition(null, 'puc-github-http-error');

// WordPress shows the plugin's readme.txt changelog on the update screen. The
// GitHub release body never reaches WordPress, so the readme is the only thing
// that keeps "There is no changelog available." off a site's update details.
$api = new BylineTransitionApi($canonical_source);
$info = (new BylineTransitionChecker($api))->requestInfo();

if ($api->requestedReadmePath !== 'readme.txt') {
    fwrite(STDERR, "The updater did not read the plugin's readme.txt.\n");
    exit(1);
}

$changelog = isset($info->sections['changelog']) ? (string) $info->sections['changelog'] : '';

if ($changelog === '' || stripos($changelog, 'no changelog available') !== false) {
    fwrite(STDERR, "WordPress would show no changelog for this release.\n");
    exit(1);
}

// The release being published has to be the one the changelog documents.
if (strpos($changelog, BYLINE_TRANSITION_VERSION) === false) {
    fwrite(STDERR, 'readme.txt has no changelog entry for ' . BYLINE_TRANSITION_VERSION . ".\n");
    exit(1);
}

if ((string) $info->tested !== '6.9' || (string) $info->requires_php !== '7.4') {
    fwrite(STDERR, "readme.txt did not supply the supported WordPress and PHP versions.\n");
    exit(1);
}

// The short notice WordPress shows inline on the Plugins screen.
if (empty($info->upgrade_notice)) {
    fwrite(STDERR, 'readme.txt has no upgrade notice for ' . BYLINE_TRANSITION_VERSION . ".\n");
    exit(1);
}

echo 'Byline 0.2.3 to ' . BYLINE_TRANSITION_VERSION . " release-asset transition regression passed.\n";
