import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.tsx";
import type { Configuration } from "../data/data-layer.ts";

function buildShareLink(name: string, path: string): string {
  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set("course_name", name);
  params.set("course_path", path);
  return base + "?" + params.toString();
}

export function ConfigScreen() {
  const { dataLayer, setScreen } = useApp();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [autoNextCorrect, setAutoNextCorrect] = useState(false);
  const [autoNextDelayMs, setAutoNextDelayMs] = useState(1000);
  const [shareName, setShareName] = useState("");
  const [sharePath, setSharePath] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dataLayer.getConfig().then((c) => {
      setConfig(c);
      setAutoNextCorrect(c.auto_next_correct ?? false);
      setAutoNextDelayMs(c.auto_next_delay_ms ?? 1000);
    });
  }, [dataLayer]);

  const save = async () => {
    await dataLayer.updateConfig({
      auto_next_correct: autoNextCorrect,
      auto_next_delay_ms: autoNextDelayMs,
    });
    setScreen({ type: "course_list" });
  };

  if (!config) return <p className="p-6 text-gray-500">Loading...</p>;

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold text-cyan-700 mb-6">Settings</h2>

      <p className="text-sm text-gray-500 mb-4">
        When enabled, correct answers automatically advance to the next question
        after a short delay instead of waiting for a manual tap.
      </p>

      <label className="flex items-center gap-3 mb-4">
        <input
          type="checkbox"
          checked={autoNextCorrect}
          onChange={(e) => setAutoNextCorrect(e.target.checked)}
          className="w-5 h-5 rounded"
        />
        <span className="text-gray-700">Auto-next for correct answers</span>
      </label>

      <label className="block mb-6">
        <span className="text-gray-700 text-sm">
          Delay (milliseconds) — default: 1000
        </span>
        <input
          type="number"
          min={200}
          max={10000}
          step={100}
          value={autoNextDelayMs}
          placeholder="1000"
          onChange={(e) => setAutoNextDelayMs(Number(e.target.value))}
          className="mt-1 block w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </label>

      <div className="flex gap-3">
        <button
          onClick={save}
          className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
        >
          Save
        </button>
        <button
          onClick={() => setScreen({ type: "course_list" })}
          className="px-6 py-2 bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100"
        >
          Cancel
        </button>
      </div>

      <hr className="my-6 border-cyan-200" />

      <h3 className="text-lg font-semibold text-cyan-800 mb-2">
        Share Course Link
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Generate a shareable link that creates a course from a hosted JSON file.
        The path can be a full URL or a relative path starting with{" "}
        <code className="bg-gray-100 px-1 rounded">courses/</code>.
      </p>

      <label className="block mb-3">
        <span className="text-gray-700 text-sm">Course Name</span>
        <input
          type="text"
          placeholder="e.g. Basic German"
          value={shareName}
          onChange={(e) => setShareName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </label>

      <label className="block mb-4">
        <span className="text-gray-700 text-sm">Course Data Path</span>
        <input
          type="text"
          placeholder="e.g. courses/german/basic_german_300.json"
          value={sharePath}
          onChange={(e) => setSharePath(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </label>

      {shareName.trim() && sharePath.trim() && (
        <div className="mb-4">
          <span className="text-gray-700 text-sm block mb-1">
            Shareable Link
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={buildShareLink(shareName.trim(), sharePath.trim())}
              className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 text-sm text-gray-700"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  buildShareLink(shareName.trim(), sharePath.trim()),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
