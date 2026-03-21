import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, DecorationSet, ViewUpdate, EditorView } from "@codemirror/view";

// Definição das decorações de linha (pegam o fundo da linha inteira)
const markerDeco = Decoration.line({ class: "cm-conflict-marker" });
const currentDeco = Decoration.line({ class: "cm-conflict-current" });
const incomingDeco = Decoration.line({ class: "cm-conflict-incoming" });

export const conflictHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view);
    }

    update(update: ViewUpdate) {
      // Importante: em editores de merge, recalculamos se o doc mudar
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }

    getDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      
      // Estado do scanner: 'none', 'current' (entre << e ==), ou 'incoming' (entre == e >>)
      let section: "none" | "current" | "incoming" = "none";

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;

        if (text.startsWith("<<<<<<<")) {
          builder.add(line.from, line.from, markerDeco);
          section = "current";
        } else if (text.startsWith("=======")) {
          builder.add(line.from, line.from, markerDeco);
          section = "incoming";
        } else if (text.startsWith(">>>>>>>")) {
          builder.add(line.from, line.from, markerDeco);
          section = "none";
        } else {
          // Se estivermos dentro de uma seção, colorimos a linha de conteúdo
          if (section === "current") {
            builder.add(line.from, line.from, currentDeco);
          } else if (section === "incoming") {
            builder.add(line.from, line.from, incomingDeco);
          }
        }
      }
      return builder.finish();
    }
  },
  { decorations: v => v.decorations }
);