import { getExtension } from "./file";

    const keywordMap: Record<string, string[]> = {
        js: ['const', 'let', 'async', 'await', 'return', 'export', 'import', 'from', 'default', 'function', 'class', 'if', 'else'],
        ts: ['const', 'let', 'async', 'await', 'return', 'type', 'interface', 'enum', 'readonly', 'public', 'private', 'protected', 
            'import', 'from', 'declare', 'module', 'namespace', 'export', 'function', 'if', 'else', 'try', 'catch'],
        rs: ['pub', 'fn', 'match', 'impl', 'mut', 'use', 'let', 'return', 'mod', 'crate', 'async', 'if'],
        go: ['func', 'chan', 'defer', 'go', 'select', 'package', 'type', 'struct', 'interface', 'map', 'range', 'if', 'else', 'for', 'return', 'var'],
        java: [
            'public', 'private', 'protected', 'static', 'final', 'class', 'interface', 'enum', 
            'void', 'extends', 'implements', 'new', 'return', 'if', 'else', 'for', 'while', 
            'try', 'catch', 'finally', 'throw', 'throws', 'instanceof', 'synchronized', 'volatile', 'package', 'import'
        ],
        cs: [
            'public', 'private', 'internal', 'protected', 'static', 'readonly', 'partial', 'class', 'interface', 'struct', 'enum',
            'void', 'async', 'await', 'task', 'var', 'new', 'return', 'if', 'else', 'foreach', 'using', 'namespace', 'get', 'set',
            'try', 'catch', 'finally', 'throw', 'override', 'virtual', 'abstract', 'base', 'this'
        ],
        rb: [
            'def', 'end', 'class', 'module', 'if', 'else', 'elsif', 'unless', 'while', 'until', 
            'for', 'in', 'do', 'yield', 'self', 'super', 'return', 'begin', 'rescue', 'ensure', 
            'case', 'when', 'then', 'attr_accessor', 'attr_reader', 'attr_writer', 'include', 'extend'
        ],
        php: [
            'public', 'private', 'protected', 'static', 'final', 'class', 'interface', 'trait', 
            'function', 'return', 'if', 'else', 'elseif', 'foreach', 'as', 'while', 'do', 'for', 
            'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 
            'namespace', 'use', 'extends', 'implements', 'abstract', 'echo', 'die', 'exit'
        ],
        py: ['def', 'class', 'import', 'from', 'as', 'if', 'else', 'elif', 'return', 'None', 'True', 'False', 'for', 'in'],
        asp: [
            'If', 'Then', 'Else', 'ElseIf', 'End', 'For', 'Each', 'In', 'Next', 'While', 'Wend',
            'Select', 'Case', 'Function', 'Sub', 'Class', 'Public', 'Private', 'Dim', 'Set', 
            'New', 'Nothing', 'True', 'False', 'Option', 'Explicit', 'On', 'Error', 'Resume'
        ],
        gd: [
            'extends', 'class_name', 'enum', 'const', 'var', 'onready', 'export', 'setget',
            'func', 'static', 'return', 'if', 'elif', 'else', 'for', 'while', 'match', 'break',
            'continue', 'pass', 'yield', 'await', 'assert', 'self', 'tool', 'signal', 'breakpoint'
        ],
        css: ['@media', '@import', '@include', '@extend', '@mixin', '@keyframes', 'important'],
        scss: ['@media', '@import', '@include', '@extend', '@mixin', '@keyframes', '@if', '@else', '@for', '@each'],
        less: ['@import', '@plugin', '@media'],
        md: [], json: []
    };

    const hunkHeaderPattern = { 
        name: "hunk-header", 
        regex: /^(@@\s.*?\s@@)\s*(.*)/g, 
        formatter: (m: string, coords: string, funcContext: string) => 
            `<span class="text-blue-400/50 font-mono text-[10px] mr-4">${coords}</span>` +
            `<span class="text-blue-300/90 font-semibold">${funcContext}</span>`
    };

    const mdPatterns = [
        hunkHeaderPattern,
        // Títulos (Markdown Headers)
        { 
            name: "md-header", 
            regex: /^(#+\s.*)/g, 
            class: "text-blue-500 dark:text-blue-400 font-bold" 
        },
        // Links [text](url)
        { 
            name: "md-link", 
            regex: /(\[.*?\])(\(.*?\))/g, 
            formatter: (m: string, p1: string, p2: string) => 
            `<span class="text-teal-500">${p1}</span><span class="text-gray-400 text-xs">${p2}</span>`
        },
        // Bold/Italic
        { 
            name: "md-emphasis", 
            regex: /(\*\*.*?\*\*|\*.*?\*|__.*?__|_.*?_)/g, 
            class: "text-orange-400 font-semibold" 
        },
        // Inline Code `code`
        { 
            name: "md-code", 
            regex: /(`.*?`)/g, 
            class: "bg-gray-200 dark:bg-gray-800 rounded px-1 text-pink-500" 
        }
    ];

    const jsonPatterns = [
        hunkHeaderPattern,
        { 
            name: "json-key", 
            regex: /(".*?")(?=\s*:)/g, 
            class: "text-blue-500 dark:text-sky-400 font-medium" 
        },
        { 
            name: "json-comment", 
            regex: /(?<!:)(\/\/.*)|(\/\*[\s\S]*?\*\/)/g, 
            class: "text-green-500 italic" 
        },
        { 
            name: "json-string-value", 
            regex: /(?<!:)(?<=[:\[,]\s*)(".*?")|(?<=^\s*)(".*?")(?!\s*:)/g, 
            class: "text-amber-600 dark:text-orange-400" 
        },
        { 
            name: "json-constant", 
            regex: /\b(true|false|null|-?\d+(\.\d+)?)\b/g, 
            class: "text-orange-500" 
        },
        { 
            name: "json-punct", 
            regex: /[{}[\],:]/g, 
            class: "text-gray-500 dark:text-gray-400" 
        }
    ];

    const ymlPatterns = [
        hunkHeaderPattern,
        // 1. Comentários (YAML usa #)
        { 
            name: "yml-comment", 
            regex: /(#.*)/g, 
            class: "text-gray-500 italic" 
        },
        // 2. Chaves (Keys) - Tudo que vem antes de ":"
        // Captura "key:", "- key:" ou chaves com espaços
        { 
            name: "yml-key", 
            regex: /(^\s*-?\s*)([a-zA-Z0-9_-]+)(?=\s*:)/g, 
            formatter: (m: string, p1: string, p2: string) => 
                `${p1}<span class="text-blue-500 dark:text-sky-400 font-medium">${p2}</span>`
        },
        // 3. Valores de String (entre aspas)
        { 
            name: "yml-string", 
            regex: /(["'].*?["'])/g, 
            class: "text-amber-600 dark:text-orange-400" 
        },
        // 4. Âncoras e Aliases (Muito comuns em YAML avançado: & e *)
        { 
            name: "yml-anchor", 
            regex: /([&*][a-zA-Z0-9_-]+)/g, 
            class: "text-purple-500 font-bold" 
        },
        // 5. Valores Booleanos, Números e Null
        { 
            name: "yml-constant", 
            regex: /\b(true|false|yes|no|null|nil|-?\d+(\.\d+)?)\b/gi, 
            class: "text-orange-500" 
        },
        // 6. Traço de Lista (-)
        { 
            name: "yml-list-bullet", 
            regex: /(^\s*-\s+)/g, 
            class: "text-fuchsia-500 font-bold" 
        }
    ];

    const gitignorePatterns = [
        hunkHeaderPattern,
        // 1. Comentários
        { 
            name: "git-comment", 
            regex: /(#.*)/g, 
            class: "text-green-500 italic" 
        },
        // 2. Negações (Padrões que começam com !)
        { 
            name: "git-negation", 
            regex: /^(!.*)/g, 
            class: "text-orange-500 font-bold" 
        },
        // 3. Diretórios (Terminam com /)
        { 
            name: "git-folder", 
            regex: /(.+\/)$/gm, 
            class: "text-blue-400 dark:text-sky-400" 
        },
        // 4. Wildcards (* e **)
        { 
            name: "git-wildcard", 
            regex: /(\*\*|\*)/g, 
            class: "text-fuchsia-500 font-bold" 
        }
    ];
    
    const makefilePatterns = [
        hunkHeaderPattern,
        // 1. Comentários
        { 
            name: "make-comment", 
            regex: /(#.*)/g, 
            class: "text-green-500 italic" 
        },
        // 2. Alvos (Targets) - Ex: "build:", "clean:"
        { 
            name: "make-target", 
            regex: /(^[a-zA-Z0-9_-]+)(?=\s*:)/gm, 
            class: "text-blue-500 dark:text-sky-400 font-bold" 
        },
        // 3. Variáveis - Ex: $(CC), $(FLAGS) ou VAR = value
        { 
            name: "make-var", 
            regex: /(\$\([a-zA-Z0-9_-]+\)|[a-zA-Z0-9_-]+(?=\s*[+?:]?=))/g, 
            class: "text-yellow-600 dark:text-orange-300" 
        },
        // 4. Comandos especiais e Funções (wildcard, shell, ifeq)
        { 
            name: "make-func", 
            regex: /\b(wildcard|shell|foreach|if|ifeq|ifneq|else|endif|include)\b/g, 
            class: "text-fuchsia-500" 
        },
        // 5. Macros automáticos ($@, $<, $^)
        { 
            name: "make-macro", 
            regex: /(\$[@<^])(?![\w])/g, 
            class: "text-red-400 font-bold" 
        }
    ];

    const stylePatterns = [
        hunkHeaderPattern,
        // 1. Comentários (CSS suporta /* */, SCSS/LESS também //)
        { name: "comment", regex: /(\/\/.*|\/\*[\s\S]*?\*\/)/g, class: "text-green-600 dark:text-green-500 italic" },
        
        // 2. Variáveis (ex: $var no SCSS, @var no LESS, --var no CSS)
        { name: "style-var", regex: /([$@]|--)[a-zA-Z0-9_-]+/g, class: "text-teal-500 dark:text-teal-300" },

        // 3. Seletores (id, classe, tag) - Tudo que vem antes de {
        { name: "selector", regex: /([.#]?[a-zA-Z0-9_-]+)(?=\s*[,{])/g, class: "text-yellow-600 dark:text-yellow-300 font-medium" },

        // 4. Propriedades (ex: color, margin-top) - Antes do :
        { name: "property", regex: /\b([a-z-]+)(?=\s*:)/gi, class: "text-blue-500 dark:text-sky-400" },

        // 5. Valores de Cores (Hexadecimal)
        { name: "color", regex: /(#[0-9a-fA-F]{3,8})/g, class: "text-orange-400 font-mono border-b border-orange-400/30" },

        // 6. Valores Numéricos e Unidades (ex: 10px, 1.5rem, 100%)
        { name: "unit", regex: /\b(\d+(\.\d+)?)(px|rem|em|vh|vw|%|s|ms|fr|deg)\b/g, class: "text-orange-500" },

        // 7. Strings (em URLs ou content)
        { name: "string", regex: /(["'`][^"'`]*["'`])/g, class: "text-amber-600 dark:text-orange-400" },

        // 8. Pontuação Relevante
        { name: "punct", regex: /[{}();]/g, class: "text-gray-500" }
    ];

    const graphqlPatterns = [
        hunkHeaderPattern,
        // 1. Comentários (#)
        { 
            name: "gql-comment", 
            regex: /(#.*)/g, 
            class: "text-green-500 italic" 
        },
        // 2. Keywords de Estrutura (type, input, enum, schema, scalar, union, interface, extend)
        { 
            name: "gql-keyword", 
            regex: /\b(type|input|enum|schema|scalar|union|interface|extend|query|mutation|subscription|directive)\b/g, 
            class: "text-fuchsia-500 dark:text-purple-400 font-bold" 
        },
        // 3. Tipos Escalares e Tipos com ! (String, ID, Int, Float, Boolean)
        { 
            name: "gql-type", 
            regex: /\b(String|ID|Int|Float|Boolean)\b(!?)|(?<=:\s*)([A-Z][a-zA-Z0-9_]+)(!?)/g, 
            class: "text-teal-500 dark:text-teal-400" 
        },
        // 4. Definição de Campos e Argumentos (antes do :)
        { 
            name: "gql-field", 
            regex: /\b([a-z_][a-zA-Z0-9_]*)(?=\s*:|\s*\()/g, 
            class: "text-yellow-500 dark:text-orange-300" 
        },
        // 5. Strings (Description Blocks ou valores)
        { 
            name: "gql-string", 
            regex: /(""".*?"""|".*?")/gs, 
            class: "text-amber-600 dark:text-orange-400" 
        },
        // 6. Pontuação (Chaves, Parênteses, Colchetes e !)
        { 
            name: "gql-punct", 
            regex: /[{}()\[\]!:]/g, 
            class: "text-gray-400" 
        }
    ];

    function getPattern(fileName: string, dynamicKeywordRegex: RegExp) {
        let ext = getExtension(fileName)
        if (ext == 'md') return mdPatterns;
        if (ext == 'json') return jsonPatterns;
        if (ext === 'yml' || ext === 'yaml') return ymlPatterns;
        if (['gitignore', 'dockerignore', 'npmignore'].includes(ext)) {
            return gitignorePatterns;
        }
        if (fileName.toLowerCase() === 'makefile' || ext === 'mk') {
            return makefilePatterns;
        }
        if (['graphql', 'graphqls', 'gql'].includes(ext)) {
            return graphqlPatterns;
        }
        if (['css', 'scss', 'less'].includes(ext)) return stylePatterns;

        let pattern = [
            // Hunk Header (Prioridade Máxima)
            hunkHeaderPattern,
            // Comentários
            { name: "comment", regex: /(\/\/.*|\/\*[\s\S]*?\*\/)/g, class: "text-green-600 dark:text-green-500 italic" },
            // Strings
            { name: "string", regex: /(["'`][^"'`]*["'`])/g, class: "text-amber-600 dark:text-orange-400" },
            // Keywords Dinâmicas (da linguagem)
            { name: "keyword", regex: dynamicKeywordRegex, class: "text-fuchsia-500 dark:text-purple-400" },
            // Booleans e Null
            { name: "bool", regex: /\b(true|false|null|undefined)\b/g, class: "text-orange-500" },
            // Funções
            { name: "func", regex: /\b(\w+)(?=\s*\()/g, class: "text-yellow-500 dark:text-yellow-200" },
            // Type Annotations (ex: props: UserProfile)
            { 
                name: "type-def", 
                regex: /(:)\s*([A-Z][a-zA-Z0-9_]*|string|number|boolean|any|void)/g, 
                formatter: (m: string, p1: string, p2: string) => `<span class="text-gray-400">${p1}</span> <span class="text-teal-500 dark:text-teal-300">${p2}</span>`
            },
            // Componentes (Maiúscula)
            { 
                name: "component", 
                regex: /(&lt;\/?)([A-Z][a-zA-Z0-9_]*)/g, 
                formatter: (m: string, p1: string, p2: string) => `<span class="text-gray-500">${p1}</span><span class="text-teal-500 dark:text-teal-300">${p2}</span>`
            },
            // Tags Nativas (Minúscula)
            { 
                name: "tag", 
                regex: /(&lt;\/?)([a-z][a-z0-9-]*)/g, 
                formatter: (m: string, p1: string, p2: string) => `<span class="text-gray-500">${p1}</span><span class="text-blue-500 dark:text-sky-400">${p2}</span>`
            },
            // Atributos
            { name: "attr", regex: /\b([a-zA-Z0-9-]+)(?=\s*=)/gi, class: "text-purple-500 dark:text-purple-400" },
            // Fechamento de Tag e Chaves
            { name: "tag-end", regex: /(\/?&gt;)/g, class: "text-gray-500" },
            { name: "curly", regex: /[{}]/g, class: "text-yellow-600 dark:text-yellow-400" }
        ];

        if (ext == 'rb') {
            pattern.push({ 
                name: "ruby-special", 
                regex: /(?<!:)(:[a-zA-Z_][a-zA-Z0-9_]*)|(@[a-zA-Z_][a-zA-Z0-9_]*)/g, 
                class: "text-indigo-400 dark:text-indigo-300" 
            });
        }
        if (ext == 'php') {
            pattern.push({ 
                name: "php-var", 
                regex: /(\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g, 
                class: "text-teal-500 dark:text-teal-300" 
            });
        }
        if (['php', 'rb'].includes(ext)) {
            pattern.push({ 
                name: "constant", 
                regex: /\b([A-Z][A-Z0-9_]+)\b/g, 
                class: "text-yellow-600 dark:text-yellow-200/80" 
            });
            pattern.push({ 
                name: "operator", 
                regex: /(->|::|\.|=>)/g, 
                class: "text-gray-400" 
            });
        }
        if (ext == 'asp') {
            pattern.push({ 
                name: "asp-tag", 
                regex: /(&lt;%|%&gt;)/g, 
                class: "text-yellow-600 dark:text-yellow-400 font-bold" 
            });
            pattern.push({ 
                name: "asp-comment", 
                regex: /(?<!["']|^[\s]*")('.*)/g, 
                class: "text-gray-500 italic" 
            });
        }
        if (ext == 'py') {
            pattern.push({ 
                name: "yml-comment", 
                regex: /(#.*)/g, 
                class: "text-green-500 italic" 
            });
        }
        if (ext == 'gd') {
            pattern.push({ 
                name: "godot-node", 
                regex: /(\$[a-zA-Z0-9_/]+|preload|load)(?=\s*\()/g, 
                class: "text-indigo-400 dark:text-indigo-300" 
            });
            pattern.push({ 
                name: "godot-annotation", 
                regex: /(@[a-zA-Z_]+)/g, 
                class: "text-teal-500/80" 
            });
        }

        return pattern;
    }

    export function highlightCode(line: string, fileName: string): string {
        if (!line) return "";

        let extension = getExtension(fileName);
        if (extension == 'tsx') extension = 'ts';
        if (extension == 'jsx') extension = 'js';

        // 1. Prepara a lista de keywords da linguagem
        const langKeywords = keywordMap[extension] || keywordMap['js'];
        const dynamicKeywordRegex = new RegExp(`\\b(${langKeywords.join('|')})\\b`, 'g');

        // 2. Escapa HTML
        let escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // 3. Define os padrões (A ordem aqui dita a prioridade)
        const patterns = getPattern(fileName, dynamicKeywordRegex);

        let parts = [{ text: escaped, highlighted: false }];

        patterns.forEach(pattern => {
        let newParts: { text: string; highlighted: boolean }[] = [];
        parts.forEach(part => {
            if (part.highlighted) {
            newParts.push(part);
            } else {
            let lastIndex = 0;
            part.text.replace(pattern.regex, (match, ...args) => {
                const offset = args[args.length - 2] as number;
                if (offset > lastIndex) {
                newParts.push({ text: part.text.slice(lastIndex, offset), highlighted: false });
                }
                
                const res = 'formatter' in pattern && pattern.formatter
                ? pattern.formatter(match, args[0], args[1]) 
                : `<span class="${'class' in pattern ? pattern.class : ''}">${match}</span>`;

                newParts.push({ text: res, highlighted: true });
                lastIndex = offset + match.length;
                return match;
            });

            if (lastIndex < part.text.length) {
                newParts.push({ text: part.text.slice(lastIndex), highlighted: false });
            }
            }
        });
        parts = newParts;
        });

        return parts.map(p => p.text).join("");
    }