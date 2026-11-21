import { useRef, useState } from 'react'
import { ImagePlus, Keyboard, Mic, Camera, X } from 'lucide-react'
import { Card, CardBody, Field, Notice, Select, Textarea, Button } from '../../components/ui'
import VoiceRecorder from '../../components/VoiceRecorder'
import { useT, LANGS } from '../../lib/i18n'
import { DEFAULT_LIMITS, IMAGE_TYPES, MAX_TEXT, MIN_TEXT, fill } from './api'
import { starterText } from './state'

function Method({ icon: Icon, title, tone = 'forest', children }) {
  const c = tone === 'civic' ? 'bg-civic-100 text-civic' : tone === 'saffron' ? 'bg-saffron-100 text-saffron' : 'bg-forest-100 text-forest'
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c}`}><Icon className="h-4 w-4" aria-hidden /></span>
        <h3 className="font-display text-[15px] font-bold">{title}</h3>
      </div>
      <CardBody className="flex-1 space-y-3">{children}</CardBody>
    </Card>
  )
}

export default function StepDescribe({ s, set, meta, prefill }) {
  const { t } = useT()
  const limits = { ...DEFAULT_LIMITS, ...(meta?.limits || {}) }
  const fileRef = useRef(null)
  const [imgErr, setImgErr] = useState('')
  const len = s.text.trim().length

  const onText = (v) => set(v.trim() ? { text: v } : { text: v, via: 'text', voiceTranscriptId: null })

  const changeLang = (language) => {
    // Regenerate the starter description in the new language only while the citizen has not edited it.
    const patch = { language }
    if (prefill && s.text === s.starter) { const st = starterText(language, prefill); patch.text = st; patch.starter = st }
    set(patch)
  }

  const onUse = ({ text, transcriptId }) => {
    set((cur) => {
      const has = cur.text.trim() && cur.text !== cur.starter
      return { text: has ? `${cur.text.trim()}\n${text}` : text, via: 'voice', voiceTranscriptId: transcriptId }
    })
  }

  const addFiles = (list) => {
    setImgErr('')
    const files = Array.from(list || [])
    const room = limits.max_images_per_report - s.images.length
    const errors = []
    const ok = []
    for (const f of files) {
      if (!IMAGE_TYPES.includes(f.type)) { errors.push(fill(t('report.photo.badtype', '{name}: only JPEG, PNG or WebP photos are allowed.'), { name: f.name })); continue }
      if (f.size > limits.max_image_size_mb * 1024 * 1024) { errors.push(fill(t('report.photo.toobig', '{name} is larger than {mb} MB.'), { name: f.name, mb: limits.max_image_size_mb })); continue }
      if (ok.length >= room) { errors.push(fill(t('report.photo.max', 'You can add up to {n} photos.'), { n: limits.max_images_per_report })); break }
      ok.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f, url: URL.createObjectURL(f) })
    }
    if (errors.length) setImgErr(errors.join(' '))
    if (ok.length) set((cur) => ({ images: [...cur.images, ...ok] }))
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeImage = (id) => set((cur) => {
    const hit = cur.images.find((i) => i.id === id)
    if (hit) URL.revokeObjectURL(hit.url)
    return { images: cur.images.filter((i) => i.id !== id) }
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <Field label={t('report.lang.label', 'Language of your report')} hint={t('report.lang.hint', 'Choose the language you will write or speak in. Your saved language is used by default.')} htmlFor="rep-lang">
            <Select id="rep-lang" value={s.language} onChange={(e) => changeLang(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <p className="text-sm text-muted">{t('report.describe.intro', 'Use any one of these, or combine them.')}</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Method icon={Keyboard} title={t('report.input.type', 'Type')}>
          <Field label={t('report.type.label', 'Describe the issue')} htmlFor="rep-text"
            hint={`${len} / ${MAX_TEXT}`} error={len > 0 && len < MIN_TEXT ? t('report.type.min', 'Please write at least 5 characters.') : ''}>
            <Textarea id="rep-text" className="h-40" value={s.text} maxLength={MAX_TEXT} lang={s.language}
              onChange={(e) => onText(e.target.value)}
              placeholder={t('report.type.placeholder', 'For example: a deep pothole near the bus stop, cars are swerving to avoid it.')} />
          </Field>
        </Method>

        <Method icon={Mic} title={t('report.input.speak', 'Speak')}>
          <VoiceRecorder language={s.language} maxSeconds={limits.max_audio_seconds} onUse={onUse}
            onTypeInstead={() => document.getElementById('rep-text')?.focus()} />
        </Method>

        <Method icon={Camera} title={t('report.input.photo', 'Photo')} tone="civic">
          <input ref={fileRef} id="rep-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
            onChange={(e) => addFiles(e.target.files)} />
          <Button type="button" variant="secondary" size="lg" className="w-full"
            disabled={s.images.length >= limits.max_images_per_report} onClick={() => fileRef.current?.click()}>
            <ImagePlus className="h-5 w-5" aria-hidden /> {t('report.photo.add', 'Add photos')}
          </Button>
          <p className="text-xs text-muted">{fill(t('report.photo.hint', 'Up to {n} photos (JPEG, PNG or WebP, max {mb} MB each).'), { n: limits.max_images_per_report, mb: limits.max_image_size_mb })}</p>
          {imgErr && <p role="alert" className="text-xs font-medium text-critical">{imgErr}</p>}
          {s.images.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {s.images.map((i) => (
                <li key={i.id} className="relative">
                  <img src={i.url} alt={i.file.name} className="h-20 w-full rounded-md border border-line object-cover" />
                  <button type="button" onClick={() => removeImage(i.id)} aria-label={`${t('report.photo.remove', 'Remove photo')}: ${i.file.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface text-ink hover:bg-paper">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Method>
      </div>

      {s.images.length > 0 && len < MIN_TEXT && (
        <Notice tone="warning">{t('report.photo.needtext', 'A photo on its own is not enough. Please also type or say a few words so we know what the problem is.')}</Notice>
      )}
    </div>
  )
}
