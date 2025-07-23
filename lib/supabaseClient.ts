import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kyazeqebtgjkscctggip.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5YXplcWVidGdqa3NjY3RnZ2lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMTY0NjMsImV4cCI6MjA2ODY5MjQ2M30.YaDbQQ0FDAdbcI9Qcb1pRCUEtBeFiqELv7Lnx2I0W1I'


export const supabase = createClient(supabaseUrl, supabaseAnonKey)

