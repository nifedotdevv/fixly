import AcceptForm from './AcceptForm.jsx'
import RejectForm from './RejectForm.jsx'
import QuoteForm from './QuoteForm.jsx'

// Keyed by action.id; each form takes ({ action, mutation, view }).
export default { accept: AcceptForm, reject: RejectForm, 'submit-quote': QuoteForm }
