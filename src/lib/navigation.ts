import type { SiteLang, SiteMenu, SiteSection } from '../types';

export function menuHref(menu: SiteMenu, lang: SiteLang): string {
  if (menu.kind === 'board') return `/${lang}/menu/${menu.id}/`;
  return menu.postPath ? `${menu.postPath}?menu=${menu.id}` : '';
}

export function pageHref(page: { lang: SiteLang; section: SiteSection; slug: string }) {
  return `/${page.lang}/${page.section}/${page.slug}/`;
}

export function editHref(page: { lang: SiteLang; section: SiteSection; slug: string }) {
  return `/${page.lang}/edit/${page.section}/${page.slug}/`;
}

export function menuTrail(menus: SiteMenu[], id: number | null): SiteMenu[] {
  const byId = new Map(menus.map((menu) => [menu.id, menu]));
  const trail: SiteMenu[] = [];
  while (id !== null && byId.has(id) && trail.length < menus.length) {
    const menu = byId.get(id)!;
    trail.unshift(menu);
    id = menu.parentId;
  }
  return trail;
}

export function menuChoices(menus: SiteMenu[], parentId: number | null = null, depth = 0): { menu: SiteMenu; depth: number }[] {
  return menus.filter((menu) => menu.parentId === parentId)
    .flatMap((menu) => [{ menu, depth }, ...menuChoices(menus, menu.id, depth + 1)]);
}
