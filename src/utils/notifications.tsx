import toast from 'solid-toast';

export const notify = {
  success: (title: string, message: string) => {
    toast.custom((t) => (
      <div class={`${t.visible ? 'animate-bounce-in' : 'animate-fade-out'} 
        max-w-md w-80 bg-slate-800 shadow-2xl rounded-lg border border-slate-700 flex overflow-hidden`}>
        <div class="w-1.5 bg-green-500"></div>
        <div class="flex-1 p-3">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          <p class="text-sm text-slate-100 mt-0.5">{message}</p>
        </div>
        <button 
          onClick={() => toast.dismiss(t.id)}
          class="px-3 text-slate-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    ), { duration: 4000 });
  },

  error: (title: string, message: string) => {
    toast.custom((t) => (
      <div class={`${t.visible ? 'animate-bounce-in' : 'animate-fade-out'} 
        max-w-md w-80 bg-slate-800 shadow-2xl rounded-lg border border-slate-700 flex overflow-hidden`}>
        <div class="w-1.5 bg-red-500"></div>
        <div class="flex-1 p-3">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          <p class="text-sm text-slate-100 mt-0.5">{message}</p>
        </div>
        <button 
          onClick={() => toast.dismiss(t.id)}
          class="px-3 text-slate-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    ), { duration: 4000 });
  }
};