import { Link } from 'react-router-dom'
import { FileQuestion, ArrowRight } from 'lucide-react'

export default function NotFound() {
  return <div className="min-h-[60vh] flex items-center justify-center px-4"><div className="text-center"><FileQuestion className="h-16 w-16 text-neutral-300 mx-auto mb-4" /><h1 className="text-2xl font-bold text-neutral-900">الصفحة غير موجودة</h1><p className="text-neutral-500 mt-2">الرابط الذي فتحته غير متاح أو تم نقله.</p><Link to="/" className="btn-primary inline-flex mt-6"><ArrowRight className="h-4 w-4" /> العودة للرئيسية</Link></div></div>
}
