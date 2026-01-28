import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext.tsx";
import type { Configuration } from "../data/data-layer.ts";

export function ConfigScreen() {
  const { dataLayer, setScreen } = useApp();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [autoNextCorrect, setAutoNextCorrect] = useState(false);
  const [autoNextDelayMs, setAutoNextDelayMs] = useState(1000);

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
      <h2 className="text-xl font-bold text-gray-800 mb-6">Settings</h2>

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
          className="mt-1 block w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      <div className="flex gap-3">
        <button
          onClick={save}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Save
        </button>
        <button
          onClick={() => setScreen({ type: "course_list" })}
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
