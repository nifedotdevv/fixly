import artisanForms from './actions/artisan/index.js'
import homeownerForms from './actions/homeowner/index.js'

// Action ids are unique across roles; actionsFor() only returns the viewer's own actions.
const forms = { ...artisanForms, ...homeownerForms }

export function renderActionForm(action, mutation) {
  const Form = forms[action.id]
  return Form ? <Form action={action} mutation={mutation} /> : null
}
