# Unity Bridge API

Base URL:

```text
http://localhost:7777
http://127.0.0.1:7777
```

## Endpoints

- `POST /api/health`
- `POST /api/list_scenes`
- `POST /api/find_objects`
- `POST /api/inspect_object`
- `POST /api/set_transform`
- `POST /api/set_light`
- `POST /api/set_camera`
- `POST /api/set_active`
- `POST /api/scene_hierarchy`
- `POST /api/scene_grep`
- `POST /api/scene_radius`
- `POST /api/execute`
- `POST /api/screenshot`
- `POST /api/camera_screenshot`
- `POST /api/play_mode`

## Response shape

```json
{
  "success": true,
  "error": null,
  "errorCode": null,
  "data": "...",
  "logs": [],
  "meta": {
    "requestId": "string",
    "endpoint": "/api/example",
    "durationMs": 12,
    "timestampUtc": "2026-04-21T12:34:56.0000000Z"
  },
  "messages": [
    { "type": "text", "content": "..." }
  ]
}
```

## Notes

- `camera_screenshot` can render either from an existing `Camera` resolved by `path` or `instance_id`, or from a temporary camera using `position` and `target`.
- Direct edit endpoints update common `Transform`, `Light`, `Camera`, and active-state fields without relying on dynamic C# execution.
