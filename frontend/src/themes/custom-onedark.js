import { tags as t } from '@lezer/highlight';
import { createTheme } from '@uiw/codemirror-themes';

export const defaultSettingsMaterial = {
    background: '#1e2126',
    foreground: '#abb2bf',
    caret: '#528bff',
    selection: 'rgba(204, 217, 255, 0.09)',
    selectionMatch: 'rgba(204, 217, 255, 0.09)',
    gutterBackground: '#1e2126',
    gutterForeground: '#515863ff',
    gutterActiveForeground: '#abb2bf',
    lineHighlight: 'rgba(204, 217, 255, 0.05)',
};

export const defaultSettingsMaterialDark = defaultSettingsMaterial;

export const materialDarkStyle = [
    { tag: t.keyword, color: '#e06c75' },
    { tag: [t.name, t.deleted, t.character, t.macroName], color: '#e06c75' },
    { tag: [t.propertyName], color: '#f76e79' },
    { tag: [t.variableName], color: '#99cc99' },
    { tag: [t.function(t.variableName)], color: '#6699cc' },
    { tag: [t.labelName], color: '#e06c75' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#eda35e' },
    { tag: [t.definition(t.name), t.separator], color: '#c678dd' },
    { tag: [t.brace], color: '#f76e79' },
    { tag: [t.annotation], color: '#eda35e' },
    { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#eda35e' },
    { tag: [t.typeName, t.className], color: '#eda35e' },
    { tag: [t.operator, t.operatorKeyword], color: '#f76e79' },
    { tag: [t.tagName], color: '#e06c75' },
    { tag: [t.squareBracket], color: '#f76e79' },
    { tag: [t.angleBracket], color: '#f76e79' },
    { tag: [t.attributeName], color: '#eda35e' },
    { tag: [t.regexp], color: '#e06c75' },
    { tag: [t.quote], color: '#abb2bf' },
    { tag: [t.string], color: '#6699cc' },
    {
        tag: t.link,
        color: '#98c379',
        textDecoration: 'none',
    },
    { tag: [t.url, t.escape, t.special(t.string)], color: '#6699cc' },
    { tag: [t.meta], color: '#f76e79' },
    { tag: [t.comment], color: '#777d87', fontStyle: 'italic' },
    { tag: t.monospace, color: '#777d87' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.heading, fontWeight: 'bold', color: '#eda35e' },
    { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: 'bold', color: '#eda35e' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#eda35e' },
    { tag: [t.processingInstruction, t.inserted], color: '#98c379' },
    { tag: [t.contentSeparator], color: '#56b6c2' },
    { tag: t.invalid, color: '#be5046', borderBottom: `1px dotted #be5046` },
];

export const materialInit = (options) => {
    const { theme = 'dark', settings = {}, styles = [] } = options || {};
    return createTheme({
        theme: theme,
        settings: {
            ...defaultSettingsMaterial,
            ...settings,
        },
        styles: [...materialDarkStyle, ...styles],
    });
};

export const materialDarkInit = materialInit;
export const customOneDark = materialInit();
