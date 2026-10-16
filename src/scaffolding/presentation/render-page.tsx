import { renderToStaticMarkup } from 'react-dom/server'
import { Page, ResetConfirmationPage } from './Page.js'
import type { PageModel, ResetConfirmationModel } from './page-model.js'

/** Produces a complete static document; no React runtime is sent to the browser. */
export function renderPage(model: PageModel): string {
  return `<!doctype html>${renderToStaticMarkup(<Page model={model} />)}`
}

export function renderResetConfirmation(model: ResetConfirmationModel): string {
  return `<!doctype html>${renderToStaticMarkup(
    <ResetConfirmationPage model={model} />,
  )}`
}
