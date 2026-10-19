import React from 'react'
import { PageHead } from '../ui.jsx'

// Eski API bilan moslik: <PageHeader title subtitle action/>
export default function PageHeader({ title, subtitle, action }) {
  return <PageHead title={title} sub={subtitle} actions={action}/>
}
