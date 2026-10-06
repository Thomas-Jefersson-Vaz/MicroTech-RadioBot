ARG NODELINK_BASE_IMAGE=performanc/nodelink@sha256:e15a9ae334f36432ed7f544521644bc99820eaba77ac4e592d939169b7a0bfa8
FROM ${NODELINK_BASE_IMAGE}
COPY start.mjs /opt/mikrotech/start.mjs
WORKDIR /app
ENTRYPOINT ["node","/opt/mikrotech/start.mjs"]
