import { send } from './shared.js'

/**
 * Body field of the page and announcement forms (components/admin/markdown_editor.edge): a
 * toolbar that wraps the selection in Markdown and a live preview rendered by the server
 * (data-preview-url → `{ html }`, already escaped there). Sample texts come from the buttons'
 * data-sample (AGENTS.md rule 9). Older answers never overwrite newer ones.
 */
const blockPrefix = { heading: '## ', list: '- ', ordered: '1. ', quote: '> ' }

const markdownEditor = () => ({
  length: 0,
  empty: true,
  state: 'idle',
  timer: null,
  request: 0,
  url: '',

  init() {
    this.url = this.$root.dataset.previewUrl
    this.length = this.$refs.input.value.length
    this.empty = !this.$refs.input.value.trim()
    // After a failed save the field holds the typed text, not what the server rendered.
    if (!this.empty) this.refresh()
  },

  changed() {
    this.length = this.$refs.input.value.length
    this.empty = !this.$refs.input.value.trim()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.refresh(), 350)
  },

  async refresh() {
    const body = this.$refs.input.value
    const id = ++this.request
    if (!body.trim()) {
      this.$refs.preview.innerHTML = ''
      this.state = 'idle'
      return
    }
    this.state = 'loading'
    try {
      const { html } = await send(this.url, { body })
      if (id !== this.request) return
      this.$refs.preview.innerHTML = html
      this.state = 'idle'
    } catch {
      if (id === this.request) this.state = 'error'
    }
  },

  /** Wraps the selection (or a sample text) in the chosen syntax and selects the text. */
  apply({ action, sample }) {
    const input = this.$refs.input
    const { selectionStart: start, selectionEnd: end, value } = input
    const selected = value.slice(start, end) || sample || ''
    let before = ''
    let after = ''
    let text = selected
    if (action === 'bold') [before, after] = ['**', '**']
    else if (action === 'italic') [before, after] = ['*', '*']
    else if (action === 'link') [before, after] = ['[', '](https://)']
    else if (blockPrefix[action]) {
      // Block syntax goes at the start of each selected line, on a line of its own.
      const prefix = blockPrefix[action]
      text = selected
        .split('\n')
        .map((line, index) =>
          action === 'ordered' ? `${index + 1}. ${line}` : prefix + line.replace(/^#+\s*/, '')
        )
        .join('\n')
      before = start > 0 && value[start - 1] !== '\n' ? '\n\n' : ''
      after = end < value.length && value[end] !== '\n' ? '\n\n' : ''
    }
    input.focus()
    input.setRangeText(before + text + after, start, end, 'end')
    const textStart = start + before.length
    input.setSelectionRange(textStart, textStart + text.length)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  },
})

export const components = { markdownEditor }
