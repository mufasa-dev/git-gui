import toast from 'solid-toast';

const baseToast = (title: string, message: string, colorClass: string, isVisible: boolean, toastId: string) => (
  <div class={`${isVisible ? 'animate-bounce-in' : 'animate-fade-out'} 
    max-w-md w-80 bg-slate-800 shadow-2xl rounded-lg border border-slate-700 flex overflow-hidden ring-1 ring-white/5`}>
    <div class={`w-1.5 ${colorClass}`}></div>
    <div class="flex-1 p-3">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">{title}</p>
      <p class="text-sm text-slate-100 font-medium leading-tight">{message}</p>
    </div>
    <button 
      onClick={() => toast.dismiss(toastId)}
      class="px-3 text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all text-lg"
    >
      ✕
    </button>
  </div>
);

export const notify = {
  success: (title: string, message: string) => {
    toast.custom((t) => baseToast(title, message, 'bg-green-500', t.visible, t.id), { duration: 4000 });
  },
  error: (title: string, message: string) => {
    toast.custom((t) => baseToast(title, message, 'bg-red-500', t.visible, t.id), { duration: 5000 });
  }
};