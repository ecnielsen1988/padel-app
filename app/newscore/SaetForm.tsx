'use client'

import React from 'react'
import { SpillerVaelger } from './SaetVaelger'

type Props = {
  index: number
  saet: any
  spillerOptions: { value: string; label: string }[]
  opdaterSaet: (index: number, felt: string, value: any) => void
  begrænsedeSpillere?: { value: string; label: string }[] | null
}

export const SaetForm = ({ index, saet, spillerOptions, opdaterSaet, begrænsedeSpillere }: Props) => {
  const erFørsteSæt = index === 0
  const spillerValg = erFørsteSæt ? spillerOptions : (begrænsedeSpillere || [])

  const spillerFelt = (felt: string, værdi: any) => (
    <div style={{ marginBottom: '0.5rem' }}>
      <SpillerVaelger
        index={index}
        felt={felt}
        værdi={værdi}
        onChange={(felt, v) => opdaterSaet(index, felt, v)}
        options={spillerValg}
        erFørsteSæt={erFørsteSæt}
      />
    </div>
  )

  const scoreKnap = (felt: 'scoreA' | 'scoreB', værdi: number) => (
    <button
      key={værdi}
      onClick={() => opdaterSaet(index, felt, værdi)}
      type="button"
      style={{
        padding: '0.5rem',
        margin: '0.2rem',
        backgroundColor: saet[felt] === værdi ? '#d81b60' : '#f8bbd0',
        color: saet[felt] === værdi ? 'white' : 'black',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        width: '36px',
      }}
    >
      {værdi}
    </button>
  )

  return (
    <div style={{
      border: '2px solid #d81b60',
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '1.5rem',
      background: 'white'
    }}>
      <h3 style={{ marginBottom: '1rem', color: '#d81b60' }}>Sæt #{index + 1}</h3>

      <input
        type="date"
        value={saet.date}
        onChange={(e) => opdaterSaet(index, 'date', e.target.value)}
        style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
      />

      {/* Hold A */}
      <div style={{ marginBottom: '1rem' }}>
        {spillerFelt('holdA1', saet.holdA1)}
        {spillerFelt('holdA2', saet.holdA2)}
        <div style={{ textAlign: 'center' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((val) => scoreKnap('scoreA', val))}
        </div>
      </div>

      {/* Skillelinje */}
      <div style={{ height: '2px', background: '#d81b60', margin: '1rem 0' }} />

      {/* Hold B */}
      <div>
        {spillerFelt('holdB1', saet.holdB1)}
        {spillerFelt('holdB2', saet.holdB2)}
        <div style={{ textAlign: 'center' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((val) => scoreKnap('scoreB', val))}
        </div>
      </div>
    </div>
  )
}
