<?php
use Symfony\Component\Finder\Finder;
return [
    'prefix' => 'BylineMcpVendor',
    'finders' => [Finder::create()->files()->in(getcwd() . '/vendor')->append([getcwd() . '/composer.json', getcwd() . '/composer.lock'])],
    'expose-global-classes' => false,
    'expose-global-functions' => false,
    'expose-global-constants' => false,
];
