export async function readAgentEventStream(response, onEvent) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Workspace HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("Workspace did not return an Agent stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let result = null;

  const consume = async (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (!event || typeof event.event !== "string") throw new Error("Invalid Workspace Agent stream event");
    await onEvent(event);
    if (event.event === "result") result = event.data;
    if (event.event === "error") throw new Error(event.message || "Workspace Agent stream failed");
  };

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() || "";
    for (const line of lines) await consume(line);
    if (done) break;
  }
  await consume(buffered);
  if (!result) throw new Error("Workspace Agent stream ended without a result");
  return result;
}
