import Quill from "quill";
import Delta from "quill-delta";
import { QuillLanguageTool } from ".";
import debug from "./debug";

/**
 * Clean all suggestion boxes from an HTML string
 *
 * @param html HTML to clean
 * @returns Cleaned text
 */
export function getCleanedHtml(html: string) {
  return html.replace(/<quill-lt-match .+?>(.*?)<\/quill-lt-match>/g, "$1");
}

/**
 * Remove all suggestion boxes from the editor.
 */
export function removeSuggestionBoxes(quillEditor: Quill) {
  //debug("Removing suggestion boxes for editor", quillEditor);

  const initialSelection = quillEditor.getSelection();
  debug("removeSuggestionBoxes, initialSelection: ", initialSelection )
  const deltas = quillEditor.getContents();

  const deltasWithoutSuggestionBoxes = deltas.ops.map((delta) => {
    if (delta.attributes && delta.attributes.ltmatch) {
      return {
        ...delta,
        attributes: {
          ...delta.attributes,
          ltmatch: null,
        },
      };
    }
    return delta;
  });
  if (quillEditor.history) {
    quillEditor.history.ignoreChange = true;
  }
  
  // @ts-ignore
  quillEditor.setContents(new Delta(deltasWithoutSuggestionBoxes), Quill.sources.SILENT);

  if (quillEditor.history) {
    quillEditor.history.ignoreChange = false;
  }
  if (initialSelection) {
    quillEditor.setSelection(initialSelection, Quill.sources.SILENT);
  }
}

/**
 * Manager for the suggestion boxes.
 * This handles inserting and removing suggestion box elements from the editor.
 */
export class SuggestionBoxes {
  constructor(private readonly parent: QuillLanguageTool) {}

  /**
   * Remove all suggestion boxes from the editor.
   */
  public removeSuggestionBoxes() {
    this.parent.preventLoop();
    removeSuggestionBoxes(this.parent.quill);
  }

  /**
   * Insert a suggestion box into the editor.
   *
   * This uses the matches stored in the parent class
   */
  public addSuggestionBoxes() {
    const initialSelection = this.parent.quill.getSelection();
    debug("addSuggestionBoxes, initialSelection: ", initialSelection )
    this.parent.matches.forEach((match) => {
      this.parent.preventLoop();

      const ops = new Delta()
        .retain(match.offset)
        .retain(match.length, { ltmatch: match });
        if (this.parent.quill.history) {
          this.parent.quill.history.ignoreChange = true;
        }
      // @ts-ignore
      let delta = this.parent.quill.updateContents(ops, Quill.sources.SILENT);
      //debug("Adding formatter", "lt-match", match.offset, match.length);
      if (this.parent.quill.history) {
        this.parent.quill.history.ignoreChange = false;
      }
    });
    if (initialSelection) {
      this.parent.quill.setSelection(initialSelection, Quill.sources.SILENT);
    }
  }
}
