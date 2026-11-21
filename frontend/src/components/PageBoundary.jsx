// Wraps a layout's <Outlet/> so that opening a page for the first time (its code chunk is still downloading) only shows a
// small loader inside the content area. The header / navigation of the layout stays on screen: nothing blanks or jumps.
import { Suspense, useEffect, useState } from 'react'
import { Spinner } from './ui'

/** Shows nothing for the first 180 ms (fast loads never flash a spinner), then a calm centred loader. */
function DelayedSpinner() {
  const [show, setShow] = useState(false)
  useEffect(() => { const id = setTimeout(() => setShow(true), 180); return () => clearTimeout(id) }, [])
  return <div className="min-h-[50vh]">{show && <Spinner className="py-16" />}</div>
}

export default function PageBoundary({ children }) {
  return <Suspense fallback={<DelayedSpinner />}>{children}</Suspense>
}
