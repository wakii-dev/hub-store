import { describe, expect, it } from 'vitest';
import {
  DESIGN_TOKENS,
  antdLessModifyVars,
  sharedCssVariables,
  sharedTheme,
} from './shared-theme';

describe('theme preset (SF-6 direction B — Modern SaaS Airy)', () => {
  it('sharedTheme carries FPT orange + radius + Roboto + body 14', () => {
    expect(sharedTheme.primary).toBe('#EB6E09');
    expect(sharedTheme.borderRadius).toBe(8);
    expect(sharedTheme.borderRadiusLG).toBe(20);
    expect(sharedTheme.fontFamily).toContain('Roboto');
    expect(sharedTheme.fontSize).toBe(14);
  });

  it('typography scale §1.5: h1 21 bold · h2 17 bold · body 14 · bodySm 13 · caption 12.5', () => {
    expect(sharedTheme.typography.h1).toEqual({
      fontSize: 21,
      fontWeight: 700,
      letterSpacing: '-0.02em',
    });
    expect(sharedTheme.typography.h2).toEqual({
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: '-0.01em',
    });
    expect(sharedTheme.typography.h3).toEqual({ fontSize: 14, fontWeight: 700 });
    expect(sharedTheme.typography.body).toEqual({ fontSize: 14 });
    expect(sharedTheme.typography.bodySm).toEqual({ fontSize: 13 });
    expect(sharedTheme.typography.caption).toEqual({ fontSize: 12.5 });
  });

  it('status colors §1.1 (pastel + line, Untitled-UI pattern)', () => {
    expect(DESIGN_TOKENS.color.status).toMatchObject({
      success: '#039855',
      successBg: '#ECFDF3',
      successLine: '#ABEFC6',
      error: '#D92D20',
      errorBg: '#FEF3F2',
      errorLine: '#FECDCA',
      warning: '#B54708',
      warningBg: '#FFFAEB',
      warningLine: '#FEDF89',
      info: '#1570EF',
      infoBg: '#EFF8FF',
      infoLine: '#B2DDFF',
    });
  });

  it('shadow scale §1.3', () => {
    expect(DESIGN_TOKENS.shadow.xs).toBe('0 1px 2px rgba(16,24,40,.05)');
    expect(DESIGN_TOKENS.shadow.primary).toBe('0 3px 10px rgba(235,110,9,.35)');
    expect(DESIGN_TOKENS.shadow.focus).toBe('0 0 0 4px rgba(235,110,9,.12)');
  });

  it('antd4 LESS modifyVars derived from same tokens (primary, radii, font, table padding)', () => {
    expect(antdLessModifyVars['@primary-color']).toBe('#EB6E09');
    expect(antdLessModifyVars['@primary-color-hover']).toBe('#F68A2E');
    expect(antdLessModifyVars['@border-radius-base']).toBe('8px');
    expect(antdLessModifyVars['@border-radius-lg']).toBe('20px');
    expect(antdLessModifyVars['@font-size-base']).toBe('14px');
    expect(antdLessModifyVars['@table-padding-vertical']).toBe('13px');
    expect(antdLessModifyVars['@table-padding-horizontal']).toBe('14px');
    expect(antdLessModifyVars['@layout-body-background']).toBe('#F7F8FA');
    expect(antdLessModifyVars['@layout-sider-background']).toBe('#101828');
    expect(antdLessModifyVars['@font-family']).toContain('Roboto');
  });

  it('css variables use SF-6 names', () => {
    expect(sharedCssVariables['--primary']).toBe('#EB6E09');
    expect(sharedCssVariables['--primary-bg']).toBe('#FEF6EE');
    expect(sharedCssVariables['--radius-control']).toBe('8px');
    expect(sharedCssVariables['--radius-modal']).toBe('20px');
    expect(sharedCssVariables['--radius-popup']).toBe('20px'); // deprecated alias
    expect(sharedCssVariables['--sidebar-width']).toBe('64px');
    expect(sharedCssVariables['--header-height']).toBe('60px');
    expect(sharedCssVariables['--shadow-focus']).toBe(
      '0 0 0 4px rgba(235,110,9,.12)',
    );
  });
});
