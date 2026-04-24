import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { StatsDisplay } from "../components/StatsDisplay";
import { Spinner } from "../components/Spinner";

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");

  const campaignId = Number(id);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.getCampaign(campaignId),
  });

  const { data: stats } = useQuery({
    queryKey: ["campaign-stats", campaignId],
    queryFn: () => api.getCampaignStats(campaignId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-stats", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const sendMutation = useMutation({
    mutationFn: () => api.sendCampaign(campaignId),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const scheduleMutation = useMutation({
    mutationFn: () => api.scheduleCampaign(campaignId, scheduleDate),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate("/campaigns");
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) return <Spinner />;
  if (!campaign) return <div className="text-center py-12 text-gray-500">Campaign not found</div>;

  const isDraft = campaign.status === "draft";
  const isScheduled = campaign.status === "scheduled";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-gray-500 text-sm">{campaign.subject}</p>
        </div>
        <button
          onClick={() => navigate("/campaigns")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Back to list
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Body preview */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-2">Email Body</h2>
        <p className="text-gray-800 whitespace-pre-wrap">{campaign.body}</p>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Campaign Stats</h2>
          <StatsDisplay stats={stats} />
        </div>
      )}

      {/* Actions */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {(isDraft || isScheduled) && (
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {sendMutation.isPending ? "Sending..." : "Send Now"}
            </button>
          )}

          {isDraft && (
            <div className="flex gap-2 items-center">
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              />
              <button
                onClick={() => scheduleMutation.mutate()}
                disabled={!scheduleDate || scheduleMutation.isPending}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Schedule
              </button>
            </div>
          )}

          {isDraft && (
            <button
              onClick={() => {
                if (confirm("Delete this campaign?")) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Recipients */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-500 mb-3">
          Recipients ({campaign.recipients.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Sent At</th>
                <th className="pb-2 font-medium">Opened At</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaign.recipients.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{r.email}</td>
                  <td className="py-2">
                    <span
                      className={`text-xs font-medium ${
                        r.status === "sent"
                          ? "text-green-600"
                          : r.status === "failed"
                            ? "text-red-600"
                            : "text-gray-500"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-500">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 text-gray-500">
                    {r.opened_at ? new Date(r.opened_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
