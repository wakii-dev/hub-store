import { describe, expect, it } from 'vitest';
import {
  DESIGN_TOKENS,
  antdLessModifyVars,
  sharedCssVariables,
  sharedTheme,
} from './shared-theme';

describe('theme preset (REQUIREMENTS §7)', () => {
  it('sharedTheme carries FPT orange + radius + Roboto + body 16', () => {
    expect(sharedTheme.primary).toBe('#EB6E09');
    expect(sharedTheme.borderRadius).toBe(2);
    expect(sharedTheme.borderRadiusLG).toBe(8);
    expect(sharedTheme.fontFamily).toContain('Roboto');
    expect(sharedTheme.fontSize).toBe(16);
  });

  it('typography scale §7: h1 24 bold · h2 20 bold · body 16 · label 14 · caption 12', () => {
    expect(sharedTheme.typography.h1).toEqual({ fontSize: 24, fontWeight: 700 });
    expect(sharedTheme.typography.h2).toEqual({ fontSize: 20, fontWeight: 700 });
    expect(sharedTheme.typography.body).toEqual({ fontSize: 16 });
    expect(sharedTheme.typography.label).toEqual({ fontSize: 14 });
    expect(sharedTheme.typography.caption).toEqual({ fontSize: 12 });
  });

  it('status colors §7', () => {
    expect(DESIGN_TOKENS.color.status).toMatchObject({
      success: '#389E0D',
      error: '#F5222D',
      warning: '#D58F04',
      info: '#0066D3',
    });
  });

  it('antd4 LESS modifyVars derived from same tokens (primary, radii, font)', () => {
    expect(antdLessModifyVars['@primary-color']).toBe('#EB6E09');
    expect(antdLessModifyVars['@border-radius-base']).toBe('2px');
    expect(antdLessModifyVars['@border-radius-lg']).toBe('8px');
    expect(antdLessModifyVars['@font-family']).toContain('Roboto');
  });

  it('css variables use §7 names', () => {
    expect(sharedCssVariables['--primary']).toBe('#EB6E09');
    expect(sharedCssVariables['--radius-control']).toBe('2px');
    expect(sharedCssVariables['--radius-popup']).toBe('8px');
    expect(sharedCssVariables['--sidebar-width']).toBe('48px');
    expect(sharedCssVariables['--header-height']).toBe('55px');
  });
});
