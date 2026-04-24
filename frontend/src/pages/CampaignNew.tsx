import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client";

export function CampaignNew() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailsText, setEmailsText] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: api.createCampaign,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      navigate(`/campaigns/${data.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const recipientEmails = emailsText
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (recipientEmails.length === 0) {
      setError("Add at least one recipient email");
      return;
    }

    mutation.mutate({ name, subject, body, recipientEmails });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Campaign</h1>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-md p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Spring Sale 2024"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Subject</label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Don't miss our spring sale!"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
          <textarea
            required
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Write your email content here..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Recipient Emails
          </label>
          <textarea
            required
            rows={4}
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="One email per line, or comma-separated"
          />
          <p className="text-xs text-gray-400 mt-1">Separate emails with commas, semicolons, or newlines</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Creating..." : "Create Campaign"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/campaigns")}
            className="border px-4 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
