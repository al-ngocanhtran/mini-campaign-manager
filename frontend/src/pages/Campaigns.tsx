import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as api from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";

export function Campaigns() {
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaigns", page],
    queryFn: () => api.getCampaigns(page, limit),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link
          to="/campaigns/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          + New Campaign
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 mb-4 text-sm">
          {error instanceof Error ? error.message : "Failed to load campaigns"}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : data?.campaigns.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg mb-2">No campaigns yet</p>
          <Link to="/campaigns/new" className="text-blue-600 hover:underline text-sm">
            Create your first campaign
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg divide-y">
            {data?.campaigns.map((c) => (
              <Link
                key={c.id}
                to={`/campaigns/${c.id}`}
                className="block px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{c.subject}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">
                      {c.recipient_count} recipient{c.recipient_count !== 1 ? "s" : ""}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
