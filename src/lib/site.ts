import type { SiteLang, SiteSection } from '../types';

export const SITE_NAME = 'GA-ML';

export type UiTextKey =
  | 'nav.home'
  | 'nav.about'
  | 'nav.tool'
  | 'nav.game'
  | 'nav.blog'
  | 'nav.langToggle'
  | 'footer.contact'
  | 'footer.privacy'
  | 'home.category'
  | 'home.tagList'
  | 'common.all'
  | 'common.loading'
  | 'common.noPosts'
  | 'common.sort'
  | 'common.descending'
  | 'common.ascending'
  | 'card.placeholder'
  | 'card.tagFallback'
  | 'card.draft'
  | 'detail.prev'
  | 'detail.next'
  | 'detail.created'
  | 'detail.updated'
  | 'detail.views'
  | 'detail.related'
  | 'detail.tagFallback'
  | 'admin.menu'
  | 'admin.actions'
  | 'admin.login'
  | 'admin.loginTitle'
  | 'admin.username'
  | 'admin.password'
  | 'admin.cancel'
  | 'admin.submit'
  | 'admin.changePassword'
  | 'admin.currentPassword'
  | 'admin.newPassword'
  | 'admin.editCurrent'
  | 'admin.editBodyLayout'
  | 'admin.write'
  | 'admin.pageManager'
  | 'admin.logout'
  | 'layout.editMode'
  | 'layout.exitEdit'
  | 'layout.save'
  | 'layout.saving'
  | 'layout.addPage'
  | 'layout.addText'
  | 'layout.addImage'
  | 'layout.deletePage'
  | 'layout.deleteElement'
  | 'layout.duplicate'
  | 'layout.bringForward'
  | 'layout.sendBackward'
  | 'layout.properties'
  | 'layout.fontSize'
  | 'layout.textAlign'
  | 'layout.imageUrl'
  | 'layout.noContent'
  | 'layout.fallbackNotice'
  | 'layout.addTable'
  | 'layout.addShape'
  | 'layout.fontFamily'
  | 'layout.bgColor'
  | 'layout.pageBg'
  | 'layout.shapeType'
  | 'layout.fill'
  | 'layout.stroke'
  | 'layout.strokeWidth'
  | 'layout.pageSettings'
  | 'layout.addRow'
  | 'layout.addCol'
  | 'layout.deleteRow'
  | 'layout.deleteCol'
  | 'layout.cellBgColor'
  | 'layout.opacity';

const UI_TEXT: Record<SiteLang, Record<UiTextKey, string>> = {
  en: {
    'nav.home': 'HOME',
    'nav.about': 'ABOUT',
    'nav.tool': 'TOOL',
    'nav.game': 'GAME',
    'nav.blog': 'BLOG',
    'nav.langToggle': 'EN / KR',
    'footer.contact': 'Contact',
    'footer.privacy': 'Privacy Policy',
    'home.category': 'Category',
    'home.tagList': 'Tag list',
    'common.all': 'All',
    'common.loading': 'Loading...',
    'common.noPosts': 'No posts yet.',
    'common.sort': 'Sort',
    'common.descending': 'Descending',
    'common.ascending': 'Ascending',
    'card.placeholder': 'Image or number',
    'card.tagFallback': 'Tag',
    'card.draft': 'draft',
    'detail.prev': '< Previous',
    'detail.next': 'Next >',
    'detail.created': 'Created',
    'detail.updated': 'Updated',
    'detail.views': 'Views',
    'detail.related': 'Related posts',
    'detail.tagFallback': 'tag',
    'admin.menu': 'Admin menu',
    'admin.actions': 'Admin actions',
    'admin.login': 'admin login',
    'admin.loginTitle': 'Admin login',
    'admin.username': 'Username',
    'admin.password': 'Password',
    'admin.cancel': 'Cancel',
    'admin.submit': 'Login',
    'admin.changePassword': 'change password',
    'admin.currentPassword': 'Current password',
    'admin.newPassword': 'New password',
    'admin.editCurrent': 'edit current post',
    'admin.editBodyLayout': 'edit body layout',
    'admin.write': 'write post',
    'admin.pageManager': 'page manager',
    'admin.logout': 'logout',
    'layout.editMode': 'Layout Edit Mode',
    'layout.exitEdit': 'Exit Edit',
    'layout.save': 'Save Layout',
    'layout.saving': 'Saving...',
    'layout.addPage': '+ Page',
    'layout.addText': '+ Text',
    'layout.addImage': '+ Image',
    'layout.deletePage': 'Delete Page',
    'layout.deleteElement': 'Delete',
    'layout.duplicate': 'Duplicate',
    'layout.bringForward': 'Forward',
    'layout.sendBackward': 'Backward',
    'layout.properties': 'Properties',
    'layout.fontSize': 'Font size (pt)',
    'layout.textAlign': 'Align',
    'layout.imageUrl': 'Image URL',
    'layout.noContent': 'No layout content yet. Click Edit Body Layout to start.',
    'layout.fallbackNotice': 'Existing content imported as initial text block.',
    'layout.addTable': '+ Table',
    'layout.addShape': '+ Shape',
    'layout.fontFamily': 'Font',
    'layout.bgColor': 'BG Color',
    'layout.pageBg': 'Page BG',
    'layout.shapeType': 'Shape',
    'layout.fill': 'Fill',
    'layout.stroke': 'Stroke',
    'layout.strokeWidth': 'Stroke W',
    'layout.pageSettings': 'Page Settings',
    'layout.addRow': '+Row',
    'layout.addCol': '+Col',
    'layout.deleteRow': '-Row',
    'layout.deleteCol': '-Col',
    'layout.cellBgColor': 'Cell BG',
    'layout.opacity': 'Opacity'
  },
  ko: {
    'nav.home': '홈',
    'nav.about': '소개',
    'nav.tool': '도구',
    'nav.game': '게임',
    'nav.blog': '블로그',
    'nav.langToggle': 'KR / EN',
    'footer.contact': '문의',
    'footer.privacy': '개인정보 처리방침',
    'home.category': '카테고리',
    'home.tagList': '태그 목록',
    'common.all': '전체',
    'common.loading': '불러오는 중...',
    'common.noPosts': '게시글이 없습니다.',
    'common.sort': '정렬',
    'common.descending': '내림차순',
    'common.ascending': '오름차순',
    'card.placeholder': '이미지 혹은 숫자',
    'card.tagFallback': '태그',
    'card.draft': '임시저장',
    'detail.prev': '< 이전글',
    'detail.next': '다음글 >',
    'detail.created': '작성일',
    'detail.updated': '수정일',
    'detail.views': '조회수',
    'detail.related': '관련 글',
    'detail.tagFallback': '태그',
    'admin.menu': '관리자 메뉴',
    'admin.actions': '관리자 동작',
    'admin.login': '관리자 로그인',
    'admin.loginTitle': '관리자 로그인',
    'admin.username': '아이디',
    'admin.password': '비밀번호',
    'admin.cancel': '취소',
    'admin.submit': '로그인',
    'admin.changePassword': '비밀번호 변경',
    'admin.currentPassword': '현재 비밀번호',
    'admin.newPassword': '새 비밀번호',
    'admin.editCurrent': '현재 글 수정',
    'admin.editBodyLayout': '본문 레이아웃 편집',
    'admin.write': '글쓰기',
    'admin.pageManager': '페이지 관리',
    'admin.logout': '로그아웃',
    'layout.editMode': '레이아웃 편집 모드',
    'layout.exitEdit': '편집 종료',
    'layout.save': '레이아웃 저장',
    'layout.saving': '저장 중...',
    'layout.addPage': '+ 페이지',
    'layout.addText': '+ 텍스트',
    'layout.addImage': '+ 이미지',
    'layout.deletePage': '페이지 삭제',
    'layout.deleteElement': '삭제',
    'layout.duplicate': '복제',
    'layout.bringForward': '앞으로',
    'layout.sendBackward': '뒤로',
    'layout.properties': '속성',
    'layout.fontSize': '글자 크기 (pt)',
    'layout.textAlign': '정렬',
    'layout.imageUrl': '이미지 URL',
    'layout.noContent': '레이아웃 내용이 없습니다. 본문 레이아웃 편집을 시작하세요.',
    'layout.fallbackNotice': '기존 본문이 초기 텍스트 박스로 변환되었습니다.',
    'layout.addTable': '+ 표',
    'layout.addShape': '+ 도형',
    'layout.fontFamily': '폰트',
    'layout.bgColor': '배경색',
    'layout.pageBg': '페이지 배경',
    'layout.shapeType': '도형 종류',
    'layout.fill': '채우기',
    'layout.stroke': '선 색',
    'layout.strokeWidth': '선 두께',
    'layout.pageSettings': '페이지 설정',
    'layout.addRow': '+행',
    'layout.addCol': '+열',
    'layout.deleteRow': '-행',
    'layout.deleteCol': '-열',
    'layout.cellBgColor': '셀 배경',
    'layout.opacity': '투명도'
  }
};

export function t(lang: SiteLang, key: UiTextKey): string {
  return UI_TEXT[lang][key] || UI_TEXT.en[key];
}

export function normalizeLang(input: string | undefined): SiteLang {
  return input === 'ko' ? 'ko' : 'en';
}

export function normalizeSection(input: string | undefined): SiteSection | null {
  if (!input) return null;
  const v = input.toLowerCase();
  if (v === 'blog') return 'blog';
  if (v === 'tools' || v === 'tool') return 'tools';
  if (v === 'games' || v === 'game') return 'games';
  if (v === 'pages' || v === 'page') return 'pages';
  return null;
}

export function sectionLabel(section: SiteSection, lang: SiteLang): string {
  const map: Record<SiteSection, { en: string; ko: string }> = {
    blog: { en: 'Blog', ko: '블로그' },
    tools: { en: 'Tool', ko: '도구' },
    games: { en: 'Game', ko: '게임' },
    pages: { en: 'Page', ko: '페이지' }
  };
  return map[section][lang];
}

export function sectionNavLabel(section: SiteSection, lang: SiteLang): string {
  if (section === 'tools') return t(lang, 'nav.tool');
  if (section === 'games') return t(lang, 'nav.game');
  if (section === 'blog') return t(lang, 'nav.blog');
  return lang === 'ko' ? '페이지' : 'PAGE';
}

export function getLanguageTogglePath(pathname: string, currentLang: SiteLang): string {
  const targetLang = currentLang === 'en' ? 'ko' : 'en';
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return `/${targetLang}/`;
  if (segments[0] !== 'en' && segments[0] !== 'ko') return `/${targetLang}/`;

  segments[0] = targetLang;
  return `/${segments.join('/')}${pathname.endsWith('/') ? '/' : ''}`;
}

export function detectBrowserLang(): SiteLang {
  const first = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  return first.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}
