// Colors are stored on shapes as tokens so a board reads well in both themes.
// A shape may also hold a plain #hex from the custom color inputs; that value passes through.
(function (DB) {
  'use strict';

  const STROKES = {
    ink: { label: 'Ink', light: '#1d1f21', dark: '#e8e6e1' },
    graphite: { label: 'Graphite', light: '#6a6e73', dark: '#9fa3a8' },
    vermilion: { label: 'Vermilion', light: '#e8401c', dark: '#ff6b47' },
    blue: { label: 'Steel blue', light: '#2c6a96', dark: '#6aa9d6' },
    green: { label: 'Pine', light: '#2a7a58', dark: '#62b892' },
    ochre: { label: 'Ochre', light: '#a66f12', dark: '#d9a648' },
  };

  const FILLS = {
    none: { label: 'No fill', light: 'none', dark: 'none' },
    paper: { label: 'Paper', light: '#fdfcf9', dark: '#1e1f22' },
    stone: { label: 'Stone', light: '#ebe9e2', dark: '#2d2e31' },
    vermilionTint: { label: 'Vermilion tint', light: '#fbe3dc', dark: '#4a2419' },
    blueTint: { label: 'Blue tint', light: '#dfeaf2', dark: '#1f3442' },
    greenTint: { label: 'Green tint', light: '#deefe6', dark: '#1e3a2e' },
    ochreTint: { label: 'Ochre tint', light: '#f6ebc6', dark: '#40351a' },
  };

  const CANVAS = {
    light: { bg: '#f6f5f0', gridMinor: '#ecebe4', gridMajor: '#e0ded5', ruler: '#efeee8', rulerText: '#62666b', rulerTick: '#b9b7ae', accent: '#e8401c', handleFill: '#ffffff', muted: '#8d8f90' },
    dark: { bg: '#17181a', gridMinor: '#202124', gridMajor: '#2a2b2f', ruler: '#1e1f22', rulerText: '#9fa3a8', rulerTick: '#4a4c50', accent: '#ff6b47', handleFill: '#17181a', muted: '#7d8084' },
  };

  const HEX = /^#[0-9a-fA-F]{6}$/;

  function isColor(value) {
    return typeof value === 'string' && (HEX.test(value) || value in STROKES || value in FILLS);
  }

  function resolve(token, theme) {
    const entry = STROKES[token] || FILLS[token];
    if (entry) return entry[theme];
    return HEX.test(token) ? token : STROKES.ink[theme];
  }

  DB.palette = { STROKES, FILLS, CANVAS, isColor, resolve };
})(window.DB);
