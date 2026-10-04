import { useEffect, useState } from 'react'
import { BellRing, CalendarClock, CheckCircle2, Clock3, MessageCircle } from 'lucide-react'
import { fetchRecalls, runDemoRecall } from '../../services/recallService'

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function RecallDeliveryTest() {
  const [recalls, setRecalls] = useState([])
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [latestDemo, setLatestDemo] = useState(null)

  async function loadRecalls() {
    const response = await fetchRecalls()
    const items = response.data || []
    setRecalls(items)
    const demoRecall = items.find((item) => item.is_demo && item.patient_name === 'Sujitha')
    if (demoRecall?.phone) setPhone(demoRecall.phone)
    if (demoRecall?.email) setEmail(demoRecall.email)
    if (demoRecall?.message_text) setLatestDemo(demoRecall)
  }

  useEffect(() => {
    loadRecalls().catch(() => setError('Could not load recalls. Please refresh and try again.')).finally(() => setLoading(false))
  }, [])

  async function handleDemoRecall(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      const response = await runDemoRecall({ phone, email: email.trim() || undefined, channels: ['sms', 'whatsapp'] })
      setLatestDemo(response.data)
      setRecalls((items) => [response.data, ...items.filter((item) => item.id !== response.data.id)])
    } catch (err) {
      setLatestDemo(null)
      setError(err.response?.data?.detail || 'Could not create the demo recall.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Patient follow-up</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Recall scheduling</h1>
          <p className="mt-1 text-sm text-slate-500">Keep screening follow-ups visible and help patients plan their next visit.</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-teal-50 p-3 text-teal-700"><CalendarClock size={22} /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Six-month screening recall</h2>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">DEMO</span>
                </div>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Create a patient record for Sujitha, schedule her next screening, and preview the reminder in one go.</p>
              </div>
            </div>

            <form onSubmit={handleDemoRecall} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Sujitha’s mobile number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={10} maxLength={20} type="tel" placeholder="Include country code, e.g. +91 98765 43210" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email address <span className="font-normal text-slate-400">(optional)</span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" maxLength={255} placeholder="Add an address to include email too" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </label>
              <div className="rounded-lg bg-teal-50 px-3 py-2.5 text-sm text-teal-900">This will send the recall by SMS and WhatsApp{email.trim() ? ' and email' : ''}.</div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={sending || !phone.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                <BellRing size={16} /> {sending ? 'Sending messages…' : email.trim() ? 'Send SMS + WhatsApp + Email' : 'Send SMS + WhatsApp'}
              </button>
              <p className="text-xs leading-5 text-slate-500">Each channel reports its result separately. Twilio senders and an approved WhatsApp template are required. Add an email above to include it; SMTP must also be configured.</p>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
            <div className="flex items-center gap-2 text-teal-300"><MessageCircle size={18} /><span className="text-sm font-semibold">Reminder preview</span></div>
            {latestDemo ? (
              <>
                <p className="mt-5 text-xs font-medium uppercase tracking-wider text-slate-400">To Sujitha · SMS: {latestDemo.sms_status?.toLowerCase()} · WhatsApp: {latestDemo.whatsapp_status?.toLowerCase()}{latestDemo.email_status && latestDemo.email_status !== 'NOT_REQUESTED' ? ` · email: ${latestDemo.email_status.toLowerCase()}` : ''}</p>
                <div className="mt-3 rounded-2xl rounded-tl-sm bg-white/10 p-4 text-sm leading-6 text-slate-100">
                  {latestDemo.sms_trial_template_used ? (
                    <><span className="font-semibold">Appointment Reminders</span><br /><span className="text-slate-300">Twilio trial SMS uses its predefined template text; it can’t include the custom reminder wording.</span></>
                  ) : latestDemo.message_text}
                </div>
                <div className={`mt-4 flex items-center gap-2 text-xs ${latestDemo.message_status === 'NOT_SENT' || latestDemo.message_status === 'FAILED' ? 'text-amber-200' : 'text-teal-200'}`}>
                  {latestDemo.message_status === 'SENT' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                  {latestDemo.message_status === 'SENT' ? 'All requested channels accepted by provider' : latestDemo.message_status === 'PARTIAL' ? 'Some channels were not accepted' : latestDemo.message_status === 'SIMULATED' ? 'This legacy reminder was simulated · no real message sent' : latestDemo.message_note || 'No message sent'} · due {formatDate(latestDemo.due_date)}
                </div>
                {Object.entries(latestDemo.delivery_errors || {}).map(([channel, reason]) => (
                  <p key={channel} role="status" className="mt-2 text-xs leading-5 text-amber-200">
                    {channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : channel}: {reason}
                  </p>
                ))}
                {Object.entries(latestDemo.delivery_notes || {}).map(([channel, note]) => (
                  <p key={channel} className="mt-2 text-xs leading-5 text-sky-200">
                    {channel === 'sms' ? 'SMS' : channel}: {note}
                  </p>
                ))}
              </>
            ) : (
              <div className="mt-5 rounded-2xl rounded-tl-sm bg-white/10 p-4 text-sm leading-6 text-slate-200">Hi Sujitha, this is a reminder from AuraMed to plan your follow-up screening. Please contact your clinic to schedule a convenient time.</div>
            )}
            <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">The button sends through SMS and WhatsApp together. Twilio needs an SMS sender and an approved WhatsApp template; optional email uses configured SMTP.</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="font-semibold text-slate-900">Scheduled recalls</h2><p className="mt-0.5 text-xs text-slate-500">Your patient follow-up queue</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{recalls.length}</span>
          </div>
          {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading recalls…</div> : recalls.length === 0 ? (
            <div className="p-10 text-center"><Clock3 className="mx-auto text-slate-300" size={28} /><p className="mt-3 text-sm font-medium text-slate-700">No recalls scheduled yet</p><p className="mt-1 text-xs text-slate-500">Run the demo above to see a patient recall appear here.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recalls.map((item) => <div key={item.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center">
                <div><p className="text-sm font-semibold text-slate-800">{item.patient_name} {item.is_demo && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">DEMO</span>}</p><p className="mt-0.5 text-xs text-slate-500">{item.patient_code} · {item.phone || 'No phone on file'}</p></div>
                <div><p className="text-[11px] text-slate-400">NEXT SCREENING</p><p className="mt-1 text-sm text-slate-700">{formatDate(item.due_date)}</p></div>
                <div><p className="text-[11px] text-slate-400">INTERVAL</p><p className="mt-1 text-sm text-slate-700">{item.recommended_interval_months} months</p></div>
                <div><span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">{item.status}</span><p className="mt-1 text-[11px] text-slate-500">SMS {item.sms_status?.toLowerCase() || 'not sent'} · WhatsApp {item.whatsapp_status?.toLowerCase() || 'not sent'}</p></div>
              </div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
