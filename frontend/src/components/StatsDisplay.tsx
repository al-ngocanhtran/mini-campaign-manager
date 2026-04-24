import type { CampaignStats } from "../api/client";

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function StatsDisplay({ stats }: { stats: CampaignStats }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4 text-center">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
          <div className="text-xs text-gray-500">Sent</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.opened}</div>
          <div className="text-xs text-gray-500">Opened</div>
        </div>
      </div>
      <div className="space-y-3">
        <ProgressBar label="Send Rate" value={stats.send_rate} color="bg-green-500" />
        <ProgressBar label="Open Rate" value={stats.open_rate} color="bg-blue-500" />
      </div>
    </div>
  );
}
