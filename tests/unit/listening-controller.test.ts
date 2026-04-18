import { describe, expect, test } from 'bun:test';

import { setListeningPanelExpanded } from '../../src/features/home/client/listening-controller';

class FakeClassList {
  private readonly tokens = new Set<string>();

  toggle(token: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.tokens.has(token);

    if (shouldAdd) {
      this.tokens.add(token);
      return true;
    }

    this.tokens.delete(token);
    return false;
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }
}

class FakeToggleButton {
  readonly attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakePanel {
  hidden = true;

  toggleAttribute(name: string, force?: boolean): boolean {
    if (name !== 'hidden') {
      throw new Error(`Unexpected attribute: ${name}`);
    }

    this.hidden = force ?? !this.hidden;
    return this.hidden;
  }
}

describe('setListeningPanelExpanded', () => {
  test('removes hidden when the track list is expanded', () => {
    const root = { classList: new FakeClassList() };
    const toggleButton = new FakeToggleButton();
    const panel = new FakePanel();

    setListeningPanelExpanded(
      root as unknown as HTMLElement,
      toggleButton as unknown as HTMLButtonElement,
      panel as unknown as HTMLElement,
      true
    );

    expect(root.classList.contains('is-expanded')).toBe(true);
    expect(toggleButton.attributes.get('aria-expanded')).toBe('true');
    expect(toggleButton.attributes.get('aria-label')).toBe('Hide track list');
    expect(panel.hidden).toBe(false);
  });

  test('adds hidden when the track list is collapsed', () => {
    const root = { classList: new FakeClassList() };
    const toggleButton = new FakeToggleButton();
    const panel = new FakePanel();

    panel.hidden = false;

    setListeningPanelExpanded(
      root as unknown as HTMLElement,
      toggleButton as unknown as HTMLButtonElement,
      panel as unknown as HTMLElement,
      false
    );

    expect(root.classList.contains('is-expanded')).toBe(false);
    expect(toggleButton.attributes.get('aria-expanded')).toBe('false');
    expect(toggleButton.attributes.get('aria-label')).toBe('Show track list');
    expect(panel.hidden).toBe(true);
  });
});
