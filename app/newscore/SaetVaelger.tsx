import Select from 'react-select'

export function SpillerVaelger({ index, felt, værdi, onChange, options, erFørsteSæt }: {
  index: number
  felt: string
  værdi: any
  onChange: (felt: string, value: any) => void
  options: { value: string; label: string }[]
  erFørsteSæt: boolean
}) {
  console.log("==== SpillerVaelger ====")
  console.log("index:", index)
  console.log("felt:", felt)
  console.log("værdi:", værdi)
  console.log("options:", options)
  console.log("erFørsteSæt:", erFørsteSæt)

  if (erFørsteSæt) {
    return (
      <Select
        placeholder="Vælg spiller"
        options={options}
        value={værdi}
        onChange={(v) => onChange(felt, v)}
        isClearable
        styles={{
          control: (base) => ({ ...base, borderRadius: '8px', fontSize: '1rem', minHeight: '42px' }),
          menu: (base) => ({ ...base, fontSize: '1rem' }),
        }}
      />
    )
  }

  return (
    <select
      value={typeof værdi === 'object' ? værdi.value : værdi || ''}
      onChange={(e) => {
        const valgt = options.find((o) => o.value === e.target.value) || null
        onChange(felt, valgt?.value || '')
      }}
      style={{
        width: '100%',
        padding: '0.4rem',
        fontSize: '1rem',
        borderRadius: '6px',
        marginBottom: '0.5rem',
      }}
    >
      <option value="">Vælg spiller</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

