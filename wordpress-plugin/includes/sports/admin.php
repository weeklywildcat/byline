<?php

if (!defined('ABSPATH')) {
    exit;
}

function wwh_sports_admin_team_label(array $summary): string
{
    $team = is_array($summary['team'] ?? null) ? $summary['team'] : [];

    return (string) ($team['displayName'] ?? $team['label'] ?? $summary['teamKey'] ?? 'Team');
}

function wwh_sports_admin_game_label(array $candidate): string
{
    $post = $candidate['post'] ?? null;
    $opponent = $post instanceof WP_Post ? byline_sports_post_meta_value((int) $post->ID, '_ww_opponent', 'Opponent') : 'Opponent';
    $start = $post instanceof WP_Post ? byline_sports_post_meta_value((int) $post->ID, '_ww_start_datetime') : '';
    $date = $start !== '' && function_exists('wwh_admin_datetime_label') ? wwh_admin_datetime_label($start) : 'TBA';
    $status = wwh_label_from_value((string) ($candidate['status'] ?? 'upcoming'));

    return trim($date . ' · ' . $status . ' · vs. ' . $opponent);
}

function wwh_sports_admin_last_result_label(array $candidate): string
{
    $post = $candidate['post'] ?? null;
    if (!$post instanceof WP_Post) {
        return '';
    }

    $score = byline_sports_post_meta_value((int) $post->ID, '_ww_wildcats_score');
    $opponent_score = byline_sports_post_meta_value((int) $post->ID, '_ww_opponent_score');
    $opponent = byline_sports_post_meta_value((int) $post->ID, '_ww_opponent', 'Opponent');
    $result = (string) ($candidate['status'] ?? 'final');
    $outcome = 'Result';

    if ($score !== '' && $opponent_score !== '') {
        if ((int) $score > (int) $opponent_score) {
            $outcome = 'W';
        } elseif ((int) $score < (int) $opponent_score) {
            $outcome = 'L';
        } else {
            $outcome = 'T';
        }
        $outcome .= ' ' . $score . '-' . $opponent_score;
    } elseif ($result === 'forfeit') {
        $outcome = 'Forfeit';
    } elseif ($result === 'tie') {
        $outcome = 'Tie';
    }

    return $outcome . ' vs. ' . $opponent;
}

function wwh_sports_overview_page_url(): string
{
    return admin_url('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE . '&page=wwh-sports-overview');
}

function wwh_render_sports_overview_page(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to view the Sports overview.', 'weekly-wildcat-headless'));
    }

    $season = byline_sports_current_season();
    $summaries = byline_sports_team_summary_rows();
    $health = byline_sports_health();
    $active = array_filter($summaries, static fn(array $summary): bool => !empty($summary['team']['active']));
    $inactive = array_filter($summaries, static fn(array $summary): bool => empty($summary['team']['active']));
    uasort($active, static fn(array $left, array $right): int => strcasecmp(wwh_sports_admin_team_label($left), wwh_sports_admin_team_label($right)));

    $games_url = byline_sports_admin_games_url('', $season);
    $teams_url = byline_sports_team_settings_url();
    $rosters_url = byline_sports_admin_rosters_url('', $season);
    $import_url = admin_url('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE . '&page=wwh-sports-import');
    ?>
    <div class="wrap wwh-sports-overview-page">
        <h1>Sports Overview</h1>
        <p class="description">Manage each team through one shared team and school-year workflow. Games, rosters, results, coverage, and public pages stay connected by the stable team key.</p>

        <div class="wwh-sports-overview-header">
            <div>
                <span class="wwh-sports-overview-eyebrow">Current season</span>
                <strong><?php echo esc_html($season); ?></strong>
            </div>
            <nav aria-label="Sports quick actions" class="wwh-sports-quick-actions">
                <a class="button button-primary" href="<?php echo esc_url(byline_sports_admin_new_game_url('', $season)); ?>">Add Game</a>
                <a class="button" href="<?php echo esc_url($teams_url); ?>">Manage Teams</a>
                <a class="button" href="<?php echo esc_url(byline_sports_admin_new_roster_url('', $season)); ?>">Add Roster</a>
                <a class="button" href="<?php echo esc_url($import_url); ?>">Import Schedule</a>
            </nav>
        </div>

        <section class="wwh-sports-overview-section" aria-labelledby="wwh-sports-teams-heading">
            <h2 id="wwh-sports-teams-heading">Teams</h2>
            <?php if ($active === []) : ?>
                <div class="notice notice-info inline"><p>No teams have been configured. <a href="<?php echo esc_url($teams_url); ?>">Add your first team</a>.</p></div>
            <?php else : ?>
                <div class="wwh-sports-team-table-wrap">
                    <table class="widefat striped wwh-sports-team-table">
                        <thead><tr><th>Team</th><th>Season</th><th>Roster</th><th>Games</th><th>Next game</th><th>Last result</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>
                        <?php foreach ($active as $summary) : ?>
                            <?php
                            $team_key = (string) $summary['teamKey'];
                            $team = is_array($summary['team'] ?? null) ? $summary['team'] : [];
                            $roster_count = (int) ($summary['publishedRosterCounts'][$season] ?? 0);
                            $athlete_count = (int) ($summary['publishedAthletesBySeason'][$season] ?? 0);
                            $game_count = (int) ($summary['gamesBySeason'][$season] ?? 0);
                            $team_url = $teams_url . '&team=' . rawurlencode($team_key);
                            ?>
                            <tr>
                                <td><strong><a href="<?php echo esc_url($team_url); ?>"><?php echo esc_html(wwh_sports_admin_team_label($summary)); ?></a></strong><br><code><?php echo esc_html($team_key); ?></code></td>
                                <td><?php echo esc_html($season); ?></td>
                                <td><?php echo $roster_count > 0 ? esc_html($athlete_count . ' ' . ($athlete_count === 1 ? 'athlete' : 'athletes')) : '<span class="wwh-sports-missing">Missing</span>'; ?></td>
                                <td><a href="<?php echo esc_url(byline_sports_admin_games_url($team_key, $season)); ?>"><?php echo esc_html((string) $game_count); ?></a></td>
                                <td><?php echo $summary['nextGame'] ? esc_html(wwh_sports_admin_game_label($summary['nextGame'])) : '—'; ?></td>
                                <td><?php echo $summary['lastResult'] ? esc_html(wwh_sports_admin_last_result_label($summary['lastResult'])) : '—'; ?></td>
                                <td><span class="wwh-sports-status-active">Active</span></td>
                                <td class="wwh-sports-actions">
                                    <a href="<?php echo esc_url($team_url); ?>">Manage</a>
                                    · <a href="<?php echo esc_url(byline_sports_admin_games_url($team_key, $season)); ?>">Games</a>
                                    · <a href="<?php echo esc_url($roster_count > 0 ? byline_sports_admin_rosters_url($team_key, $season) : byline_sports_admin_new_roster_url($team_key, $season)); ?>"><?php echo $roster_count > 0 ? 'Roster' : 'Add roster'; ?></a>
                                    · <a href="<?php echo esc_url(byline_sports_public_team_url($team, $season)); ?>" target="_blank" rel="noopener">Public page</a>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </section>

        <section class="wwh-sports-overview-section" aria-labelledby="wwh-sports-attention-heading">
            <h2 id="wwh-sports-attention-heading">Attention</h2>
            <?php if (empty($health['issues'])) : ?>
                <div class="notice notice-success inline"><p>Sports relationships are healthy for the current data.</p></div>
            <?php else : ?>
                <ul class="wwh-sports-attention-list">
                    <?php foreach (array_slice($health['issues'], 0, 12) as $issue) : ?>
                        <li class="wwh-sports-attention-<?php echo esc_attr((string) ($issue['severity'] ?? 'info')); ?>"><strong><?php echo esc_html(ucfirst((string) ($issue['severity'] ?? 'info'))); ?>:</strong> <?php echo esc_html((string) ($issue['message'] ?? 'Sports relationship needs review.')); ?></li>
                    <?php endforeach; ?>
                </ul>
                <?php if (count($health['issues']) > 12) : ?><p class="description">Showing the first 12 items. Review the Byline diagnostics endpoint for the complete health report.</p><?php endif; ?>
            <?php endif; ?>
        </section>

        <?php if ($inactive !== []) : ?>
            <section class="wwh-sports-overview-section" aria-labelledby="wwh-sports-history-heading">
                <h2 id="wwh-sports-history-heading">Inactive / Archived Teams</h2>
                <p class="description">Inactive teams remain available so historical games, rosters, linked stories, and public archive URLs do not break.</p>
                <ul class="wwh-sports-archived-team-list">
                    <?php foreach ($inactive as $summary) : ?>
                        <li><a href="<?php echo esc_url($teams_url . '&team=' . rawurlencode((string) $summary['teamKey'])); ?>"><?php echo esc_html(wwh_sports_admin_team_label($summary)); ?></a> <code><?php echo esc_html((string) $summary['teamKey']); ?></code></li>
                    <?php endforeach; ?>
                </ul>
            </section>
        <?php endif; ?>

        <p class="description wwh-sports-overview-footer"><a href="<?php echo esc_url($games_url); ?>">View current-season games</a> · <a href="<?php echo esc_url($rosters_url); ?>">View current-season rosters</a></p>
    </div>
    <?php
}
