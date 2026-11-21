import { useRef, useState } from 'react'
import { ImagePlus, Keyboard, Languages, Mic, Camera, X } from 'lucide-react'
import { IconTile, Select, Textarea, cn } from '../../components/ui'
import VoiceRecorder from '../../components/VoiceRecorder'
import { useT, LANGS } from '../../lib/i18n'
import { DEFAULT_LIMITS, IMAGE_TYPES, MAX_TEXT, MIN_TEXT, fill } from './api'
import { starterText } from './state'
import { Callout, MiniCard, StepHead } from './parts'

export default function StepDescribe({ s, set, meta, prefill, title }) {
  const { t } = useT()
  const limits = { ...DEFAULT_LIMITS, ...(meta?.limits || {}) }
  const fileRef = useRef(null)
  const [imgErr, setImgErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
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

  const full = s.images.length >= limits.max_images_per_report

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepHead
        title={title}
        subtitle={t('report.describe.intro', 'Use any one of these, or combine them.')}
        right={(
          <div className="flex items-center gap-2">
            <label htmlFor="rep-lang" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <IconTile icon={Languages} tone="civic" size="sm" />
              {t('report.lang.label', 'Language of your report')}
            </label>
            <div className="w-36">
              <Select id="rep-lang" value={s.language} onChange={(e) => changeLang(e.target.value)} aria-describedby="rep-lang-hint">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </Select>
            </div>
            <p id="rep-lang-hint" className="sr-only">{t('report.lang.hint', 'Choose the language you will write or speak in. Your saved language is used by default.')}</p>
          </div>
        )}
      />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
        {/* TYPE */}
        <MiniCard icon={Keyboard} tone="forest" title={t('report.input.type', 'Type')}
          right={<span className={cn('text-xs', len > MAX_TEXT * 0.95 ? 'font-semibold text-high' : 'text-muted')}>{len} / {MAX_TEXT}</span>}
          scroll={false} bodyClassName="flex flex-col gap-2 p-3">
          <label htmlFor="rep-text" className="text-[13px] font-semibold text-ink">{t('report.type.label', 'Describe the issue')}</label>
          <Textarea id="rep-text" className="h-44 resize-none lg:h-auto lg:flex-1" value={s.text} maxLength={MAX_TEXT} lang={s.language}
            onChange={(e) => onText(e.target.value)}
            placeholder={t('report.type.placeholder', 'For example: a deep pothole near the bus stop, cars are swerving to avoid it.')} />
          {len > 0 && len < MIN_TEXT && <p role="alert" className="text-xs font-medium text-critical">{t('report.type.min', 'Please write at least 5 characters.')}</p>}
        </MiniCard>

        {/* SPEAK */}
        <MiniCard icon={Mic} tone="saffron" title={t('report.input.speak', 'Speak')} bodyClassName="flex flex-col p-3">
          <VoiceRecorder language={s.language} maxSeconds={limits.max_audio_seconds} onUse={onUse}
            onTypeInstead={() => document.getElementById('rep-text')?.focus()} />
        </MiniCard>

        {/* PHOTO */}
        <MiniCard icon={Camera} tone="civic" title={t('report.input.photo', 'Photo')}
          right={<span className="text-xs text-muted">{s.images.length} / {limits.max_images_per_report}</span>}
          bodyClassName="flex flex-col gap-3 p-3">
          <input ref={fileRef} id="rep-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
            onChange={(e) => addFiles(e.target.files)} />
          <button type="button" disabled={full} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!full) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!full) addFiles(e.dataTransfer?.files) }}
            className={cn('flex w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed px-3 py-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              dragOver ? 'border-civic bg-civic-100' : 'border-civic/40 bg-civic-50 hover:bg-civic-100')}>
            <IconTile icon={ImagePlus} tone="civic" />
            <span className="font-display text-[14px] font-bold text-civic">{t('report.photo.add', 'Add photos')}</span>
            <span className="text-xs text-muted">{fill(t('report.photo.hint', 'Up to {n} photos (JPEG, PNG or WebP, max {mb} MB each).'), { n: limits.max_images_per_report, mb: limits.max_image_size_mb })}</span>
          </button>
          {imgErr && <p role="alert" className="text-xs font-medium text-critical">{imgErr}</p>}
          {s.images.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {s.images.map((i) => (
                <li key={i.id} className="relative">
                  <img src={i.url} alt={i.file.name} className="aspect-square w-full rounded-lg border border-line object-cover" />
                  <button type="button" onClick={() => removeImage(i.id)} aria-label={`${t('report.photo.remove', 'Remove photo')}: ${i.file.name}`}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)] hover:bg-paper">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </MiniCard>
      </div>

      {s.images.length > 0 && len < MIN_TEXT && (
        <Callout tone="warning" className="mt-3 shrink-0" role="status">{t('report.photo.needtext', 'A photo on its own is not enough. Please also type or say a few words so we know what the problem is.')}</Callout>
      )}
    </div>
  )
}
