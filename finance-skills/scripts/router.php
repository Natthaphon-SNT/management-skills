<?php
$publicPath=dirname(__DIR__).'/public';
$requestPath=urldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)??'/');
$resolved=realpath($publicPath.$requestPath);
if($resolved && is_file($resolved) && str_starts_with($resolved,realpath($publicPath).DIRECTORY_SEPARATOR)) return false;
require $publicPath.'/index.php';
