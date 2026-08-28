<?php

/**
 * Server-render the presentation wrapper for a Byline Page Section.
 *
 * The saved block contains the section attributes and normal InnerBlocks only.
 * WordPress supplies the rendered child HTML in $content and owns supported
 * wrapper attributes such as the block class, alignment, style, and anchor.
 */

$heading = sanitize_text_field((string) ($attributes['heading'] ?? ''));
$heading_level = absint($attributes['headingLevel'] ?? 2);
if (!in_array($heading_level, [2, 3, 4], true)) {
    $heading_level = 2;
}
$heading_tag = 'h' . $heading_level;
$wrapper_attributes = get_block_wrapper_attributes();
?>
<section <?php echo $wrapper_attributes; ?>>
    <?php if ($heading !== '') : ?>
        <<?php echo $heading_tag; ?> class="wp-block-heading"><?php echo esc_html($heading); ?></<?php echo $heading_tag; ?>>
    <?php endif; ?>
    <div class="wp-block-byline-page-section__body"><?php echo $content; ?></div>
</section>
