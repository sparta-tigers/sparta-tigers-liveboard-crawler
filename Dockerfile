# Builder 이미지: 개발 의존성 설치 및 빌드
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./

# 의존성 설치 (프로덕션 의존성 포함)
RUN npm install

# 소스 코드 복사
COPY . .

# 최종 이미지: 실행 가능한 앱만 포함
FROM node:20-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    && rm -rf /var/lib/apt/lists/*


# 작업 디렉토리 설정
WORKDIR /app

# builder 이미지에서 빌드 결과 복사
COPY --from=builder /app .

# 앱 실행
CMD ["node", "index.mjs"]
