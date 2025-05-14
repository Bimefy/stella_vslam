aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin 381492108418.dkr.ecr.eu-north-1.amazonaws.com
docker pull 381492108418.dkr.ecr.eu-north-1.amazonaws.com/bimefy/insv-processor:latest
docker pull 381492108418.dkr.ecr.eu-north-1.amazonaws.com/bimefy/stella-vslam:latest
docker pull 381492108418.dkr.ecr.eu-north-1.amazonaws.com/bimefy/stella-vslam-viewer:latest