FROM node:18-alpine
# 抖音云 FaaS 固定在 /opt/application 下执行 run.sh，目录必须对齐
WORKDIR /opt/application
COPY package.json ./
COPY server.js ./
COPY run.sh ./
RUN chmod +x run.sh
EXPOSE 8000
CMD ["sh", "/opt/application/run.sh"]
