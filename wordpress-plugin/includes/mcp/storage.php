<?php
namespace Byline\Mcp;

/** Only OAuth state lives here; newsroom records stay in their existing domains. */
final class Store
{
    public static string $grant = '';
    public static function table(): string { global $wpdb; return $wpdb->prefix . 'byline_mcp_auth'; }
    public static function install(): void
    {
        if (get_option('byline_mcp_schema') === '1') { return; }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table(); $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE $table (
            id varchar(64) NOT NULL,
            kind varchar(16) NOT NULL,
            actor bigint unsigned NOT NULL DEFAULT 0,
            grant_ref varchar(64) NOT NULL DEFAULT '',
            payload longtext NOT NULL,
            expires bigint unsigned NOT NULL,
            n bigint unsigned NOT NULL DEFAULT 0,
            PRIMARY KEY  (id),
            KEY expiry (expires),
            KEY actor_kind (actor,kind),
            KEY grant_ref (grant_ref)
        ) $charset;");
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($table))) !== $table) { throw new \RuntimeException('Auth storage unavailable'); }
        add_option('byline_mcp_schema', '1', '', false);
    }
    public static function key(string $kind, string $id): string { return hash('sha256', $kind . ':' . $id); }
    public static function put(string $kind, string $id, array $data, int $expires, int $actor = 0, string $grant = ''): void
    {
        global $wpdb;
        if (!$wpdb->insert(self::table(), ['id'=>self::key($kind,$id),'kind'=>$kind,'actor'=>$actor,'grant_ref'=>$grant,'payload'=>wp_json_encode($data),'expires'=>$expires])) { throw new \RuntimeException('Auth state could not be stored'); }
    }
    public static function get(string $kind, string $id): ?array
    {
        global $wpdb;
        $raw = $wpdb->get_var($wpdb->prepare('SELECT payload FROM ' . self::table() . ' WHERE id=%s AND expires>%d', self::key($kind,$id), time()));
        return is_string($raw) ? json_decode($raw, true, 32, JSON_THROW_ON_ERROR) : null;
    }
    public static function remove(string $kind, string $id): void { global $wpdb; $wpdb->delete(self::table(), ['id'=>self::key($kind,$id)]); }
    public static function revoke(string $grant): void { global $wpdb; if ($wpdb->delete(self::table(), ['grant_ref'=>$grant])===false) { throw new \RuntimeException('Connection could not be revoked'); } }
    public static function revokeActor(int $actor): void { global $wpdb; $wpdb->delete(self::table(), ['actor'=>$actor]); }
    public static function active(string $kind, string $id): bool
    {
        $row = self::get($kind,$id);
        if (!$row || !self::get('grant', $row['grant'])) { return false; }
        self::$grant = $row['grant'];
        return true;
    }
    public static function rate(string $subject, int $limit, int $seconds = 60): bool
    {
        global $wpdb;
        $id = self::key('rate', $subject . ':' . intdiv(time(), $seconds));
        $table = self::table();
        $ok = $wpdb->query($wpdb->prepare("INSERT INTO $table (id,kind,payload,expires,n) VALUES (%s,'rate','{}',%d,1) ON DUPLICATE KEY UPDATE n=n+1", $id, time()+$seconds*2));
        return $ok !== false && (int)$wpdb->get_var($wpdb->prepare("SELECT n FROM $table WHERE id=%s",$id)) <= $limit;
    }
    public static function lock(string $opaque): ?string
    {
        $id = hash('sha256', $opaque);
        global $wpdb;
        // A fenced short-lived lock serializes code redemption and refresh rotation.
        $insert=$wpdb->query($wpdb->prepare('INSERT IGNORE INTO '.self::table()." (id,kind,payload,expires) VALUES (%s,'lock','{}',%d)",self::key('lock',$id),time()+300));
        if ($insert!==1) { return null; }
        return $id;
    }
    public static function cleanup(): void { global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . ' WHERE expires<=%d', time())); }
    public static function keys(): array
    {
        $sealed = get_option('byline_mcp_keys');
        $key = hash('sha256', wp_salt('auth') . wp_salt('secure_auth') . home_url('/'), true);
        if (!$sealed) {
            $rsa = openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);
            if (!$rsa || !openssl_pkey_export($rsa,$private)) { throw new \RuntimeException('Signing keys unavailable'); }
            $keys = ['private'=>$private,'public'=>openssl_pkey_get_details($rsa)['key'],'encryption'=>base64_encode(random_bytes(32))];
            $iv=random_bytes(12); $tag='';
            $cipher=openssl_encrypt(wp_json_encode($keys),'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'byline-mcp-v1');
            if ($cipher===false) { throw new \RuntimeException('Encryption unavailable'); }
            add_option('byline_mcp_keys',base64_encode($iv.$tag.$cipher),'',false);
            $sealed=get_option('byline_mcp_keys');
        }
        $bytes=base64_decode($sealed,true);
        $plain=is_string($bytes) && strlen($bytes)>28 ? openssl_decrypt(substr($bytes,28),'aes-256-gcm',$key,OPENSSL_RAW_DATA,substr($bytes,0,12),substr($bytes,12,16),'byline-mcp-v1') : false;
        if (!$plain) { throw new \RuntimeException('Signing keys unavailable; reset MCP connections after changing WordPress salts or site URL'); }
        return json_decode($plain,true,8,JSON_THROW_ON_ERROR);
    }
}
