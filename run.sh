#!/bin/sh
# 抖音云 FaaS 启动入口：平台把代码挂载到 /opt/application 并执行 run.sh
cd /opt/application 2>/dev/null || cd "$(dirname "$0")"
export PORT="${PORT:-8000}"
exec node server.js
