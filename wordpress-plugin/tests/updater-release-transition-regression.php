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

require_once __DIR__ . '/../plugin-update-checker/plugin-update-checker.php';

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
        return false;
    }
}

final class BylineTransitionApi
{
    public $requestedPath;
    public $requestedRef;
    private $remoteSource;

    public function __construct($remote_source)
    {
        $this->remoteSource = $remote_source;
    }

    public function setLocalDirectory($directory)
    {
    }

    public function chooseReference($branch)
    {
        return (object) [
            'name' => 'v0.2.8',
            'version' => '0.2.8',
            'updated' => '2026-08-26T00:00:00Z',
            'downloadUrl' => 'https://github.com/weeklywildcat/byline/releases/download/v0.2.8/weekly-wildcat-headless.zip',
        ];
    }

    public function getRemoteFile($path, $ref = 'master')
    {
        $this->requestedPath = $path;
        $this->requestedRef = $ref;
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
        || $api->requestedRef !== 'v0.2.8'
        || $info === null
        || $info->version !== '0.2.8'
        || $info->download_url !== 'https://github.com/weeklywildcat/byline/releases/download/v0.2.8/weekly-wildcat-headless.zip'
        || $info->filename !== 'weekly-wildcat-headless/weekly-wildcat-headless.php'
        || in_array('puc-no-plugin-version', $puc_errors, true)
        || ($expected_error !== null && !in_array($expected_error, $puc_errors, true))
        || ($expected_error === null && count($puc_errors) !== 0)) {
        fwrite(STDERR, "The installed 0.2.3 to canonical 0.2.8 updater transition failed.\n");
        exit(1);
    }
}

$canonical_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($canonical_source)) {
    fwrite(STDERR, "Could not read the canonical plugin source.\n");
    exit(1);
}

verify_transition($canonical_source, null);
verify_transition(null, 'puc-github-http-error');

echo "Byline 0.2.3 to 0.2.8 release-asset transition regression passed.\n";
